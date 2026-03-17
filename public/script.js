document.addEventListener('DOMContentLoaded', () => {
    // 預設的 LaTeX 模板
    const defaultCode = `\\documentclass[12pt, a4paper, fontset=none]{ctexart}
\\usepackage{amsmath, amssymb}
\\usepackage{tikz}
\\usepackage{graphicx}
\\usepackage{wrapfig} % 支援文繞圖
% 使用系統內建字型（Windows）
\\setCJKmainfont{Noto Sans TC}
\\setCJKsansfont{Noto Sans TC}
\\setCJKmonofont{Noto Sans TC}

\\begin{document}

\\section*{歡迎使用線上 LaTeX 編輯器}

這是一個支援中文字型排版、TikZ 繪圖以及數學公式的簡易編輯器。

\\subsection*{數學公式測試}
若要在數學公式中顯示中文，請記得使用 \\verb|\\text{}| 包裝，例如：
\\begin{equation}
    \\text{(數量, 形狀, 顏色, 填充)} = (1, \\text{菱形}, \\text{紅色}, \\text{實心})
\\end{equation}

\\subsection*{PDF 反向搜尋測試}
點擊右側 PDF 預覽畫面中的這行文字，左側編輯器會自動捲動並反白此行原始碼！

\\subsection*{多媒體與排版}
請試著在左側編輯區直接按下 \\texttt{Ctrl+V} 貼上截圖，系統會跳出設定視窗，讓您選擇要置中還是文繞圖排版！

\\end{document}
`;

    // 初始化 CodeMirror
    const editorElement = document.getElementById('editor');
    const editor = CodeMirror.fromTextArea(editorElement, {
        lineNumbers: true,
        mode: 'stex', // LaTeX mode
        theme: 'dracula',
        lineWrapping: true,
        matchBrackets: true,
        autoCloseBrackets: true
    });

    editor.setValue(defaultCode);

    // 從 LaTeX 內容中提取文件標題（用於匯出檔名）
    const getDocTitle = (content) => {
        // 嘗試 \title{...}
        let m = content.match(/\\title\{([^}]+)\}/);
        if (m) return m[1].trim();
        // 嘗試第一個 \section 或 \section*
        m = content.match(/\\section\*?\{([^}]+)\}/);
        if (m) return m[1].trim();
        return 'document';
    };

    // 清理檔名：移除不安全字元
    const sanitizeFilename = (name) => {
        return name.replace(/[\\/:*?"<>|]/g, '_').substring(0, 80);
    };

    // DOM 元素參考
    const compileBtn = document.getElementById('compileBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const pdfViewer = document.getElementById('pdfViewer');
    const logContainer = document.getElementById('logContainer');
    const logOutput = document.getElementById('logOutput');
    const openBtn = document.getElementById('openBtn');
    const saveBtn = document.getElementById('saveBtn');
    const fileInput = document.getElementById('fileInput');

    // 圖像上傳相關 Modal 元素
    const imageModal = document.getElementById('imageModal');
    const imgCancelBtn = document.getElementById('imgCancelBtn');
    const imgConfirmBtn = document.getElementById('imgConfirmBtn');
    const imgAlign = document.getElementById('imgAlign');
    const imgWidth = document.getElementById('imgWidth');
    let pendingImageFile = null;
    let pendingCursor = null;

    // PDF.js 初始化設定
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    let currentPdfDoc = null;
    let currentScale = 1.2;
    let currentPdfUrl = null;

    // PDF 工具列元素
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomLevel = document.getElementById('zoomLevel');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageIndicator = document.getElementById('pageIndicator');
    const pdfViewerContainer = document.getElementById('pdfViewerContainer');
    const savePdfBtn = document.getElementById('savePdfBtn');

    const updateZoomLabel = () => {
        zoomLevel.textContent = Math.round(currentScale * 100) + '%';
    };

    // 取得目前可見頁碼
    const getCurrentVisiblePage = () => {
        const pages = pdfViewer.querySelectorAll('.page');
        if (!pages.length) return 0;
        const containerRect = pdfViewerContainer.getBoundingClientRect();
        const containerMid = containerRect.top + containerRect.height / 2;
        let closest = 1;
        let minDist = Infinity;
        pages.forEach(p => {
            const r = p.getBoundingClientRect();
            const mid = r.top + r.height / 2;
            const dist = Math.abs(mid - containerMid);
            if (dist < minDist) {
                minDist = dist;
                closest = parseInt(p.getAttribute('data-page-number'), 10);
            }
        });
        return closest;
    };

    const updatePageIndicator = () => {
        if (!currentPdfDoc) {
            pageIndicator.textContent = '0 / 0';
            return;
        }
        const cur = getCurrentVisiblePage();
        pageIndicator.textContent = `${cur} / ${currentPdfDoc.numPages}`;
    };

    // 監聽捲動更新頁碼
    pdfViewerContainer.addEventListener('scroll', updatePageIndicator);

    // 渲染 PDF
    const renderPdf = async (url) => {
        try {
            currentPdfUrl = url;
            pdfViewer.innerHTML = ''; // 清空舊內容
            const loadingTask = pdfjsLib.getDocument(url);
            currentPdfDoc = await loadingTask.promise;

            // 依序渲染每一頁
            for (let pageNum = 1; pageNum <= currentPdfDoc.numPages; pageNum++) {
                const page = await currentPdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: currentScale });

                // 建立 page container
                const pageContainer = document.createElement('div');
                pageContainer.className = 'page';
                pageContainer.style.width = `${viewport.width}px`;
                pageContainer.style.height = `${viewport.height}px`;
                pageContainer.setAttribute('data-page-number', pageNum);
                pdfViewer.appendChild(pageContainer);

                // 建立 Canvas
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                pageContainer.appendChild(canvas);

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                await page.render(renderContext).promise;

                // 建立 TextLayer 用於反向搜尋 (SyncTeX)
                const textContent = await page.getTextContent();
                const textLayerDiv = document.createElement('div');
                textLayerDiv.className = 'textLayer';
                textLayerDiv.style.setProperty('--scale-factor', currentScale);
                pageContainer.appendChild(textLayerDiv);

                pdfjsLib.renderTextLayer({
                    textContent: textContent,
                    container: textLayerDiv,
                    viewport: viewport,
                    textDivs: []
                });
            }
            updatePageIndicator();
            updateZoomLabel();
        } catch (error) {
            console.error('PDF 渲染錯誤:', error);
        }
    };

    // 縮放控制
    zoomInBtn.addEventListener('click', () => {
        if (currentScale >= 3.0) return;
        currentScale = Math.round((currentScale + 0.2) * 10) / 10;
        updateZoomLabel();
        if (currentPdfUrl) renderPdf(currentPdfUrl);
    });

    zoomOutBtn.addEventListener('click', () => {
        if (currentScale <= 0.4) return;
        currentScale = Math.round((currentScale - 0.2) * 10) / 10;
        updateZoomLabel();
        if (currentPdfUrl) renderPdf(currentPdfUrl);
    });

    // 頁面導覽
    const scrollToPage = (pageNum) => {
        const target = pdfViewer.querySelector(`.page[data-page-number="${pageNum}"]`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    prevPageBtn.addEventListener('click', () => {
        const cur = getCurrentVisiblePage();
        if (cur > 1) scrollToPage(cur - 1);
    });

    nextPageBtn.addEventListener('click', () => {
        const cur = getCurrentVisiblePage();
        if (currentPdfDoc && cur < currentPdfDoc.numPages) scrollToPage(cur + 1);
    });

    // 匯出 PDF 下載
    savePdfBtn.addEventListener('click', async () => {
        if (!currentPdfUrl) {
            alert('請先編譯文件再匯出 PDF');
            return;
        }
        const res = await fetch('/pdf');
        if (!res.ok) {
            alert('PDF 尚未產生，請先編譯');
            return;
        }
        const title = sanitizeFilename(getDocTitle(editor.getValue()));
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // 處理反向搜尋點擊事件
    pdfViewer.addEventListener('mouseup', async (e) => {
        const selection = window.getSelection();
        if (selection.toString().length > 0) return; // 使用者正在選取文字則不觸發

        // 找尋點擊位置屬於哪一頁
        const pageContainer = e.target.closest('.page');
        if (!pageContainer) return;

        const pageNum = parseInt(pageContainer.getAttribute('data-page-number'), 10);
        const rect = pageContainer.getBoundingClientRect();
        
        // 將 CSS 像素轉換為 PDF 的點座標 (Pt)
        const xPt = (e.clientX - rect.left) / currentScale;
        const yPt = (e.clientY - rect.top) / currentScale;

        try {
            const res = await fetch(`/synctex?page=${pageNum}&x=${xPt}&y=${yPt}`);
            const data = await res.json();
            
            if (data.success && data.line) {
                // 將 CodeMirror 游標移動到對應行數，從 1 反推 0-indexed
                const lineIndex = data.line - 1;
                editor.setCursor({ line: lineIndex, ch: 0 });
                editor.scrollIntoView({ line: lineIndex, ch: 0 }, 200);
                
                // Highlight 該行
                editor.addLineClass(lineIndex, 'background', 'CodeMirror-activeline-background');
                setTimeout(() => {
                    editor.removeLineClass(lineIndex, 'background', 'CodeMirror-activeline-background');
                }, 1500);
            }
        } catch (err) {
            console.error('反向搜尋失敗:', err);
        }
    });

    // 缺圖上傳 Modal 元素
    const missingImgModal = document.getElementById('missingImgModal');
    const missingImgList = document.getElementById('missingImgList');
    const missingImgInput = document.getElementById('missingImgInput');
    const missingImgCancelBtn = document.getElementById('missingImgCancelBtn');
    const missingImgUploadBtn = document.getElementById('missingImgUploadBtn');

    missingImgCancelBtn.addEventListener('click', () => {
        missingImgModal.classList.add('hidden');
        loadingOverlay.classList.add('hidden');
        compileBtn.disabled = false;
    });

    missingImgUploadBtn.addEventListener('click', async () => {
        const files = missingImgInput.files;
        if (!files || files.length === 0) {
            alert('請先選擇圖片檔案');
            return;
        }

        const formData = new FormData();
        for (const file of files) {
            formData.append('files', file);
        }
        // 加入一個空的 .tex 佔位，讓 /upload-project 不報錯
        const dummyTex = new Blob([''], { type: 'text/plain' });
        formData.append('files', new File([dummyTex], 'placeholder.tex'));

        try {
            await fetch('/upload-project', { method: 'POST', body: formData });
            missingImgModal.classList.add('hidden');
            missingImgInput.value = '';
            // 重新編譯
            await compileLatex();
        } catch (err) {
            console.error('圖片上傳失敗:', err);
            alert('圖片上傳失敗！');
        }
    });

    // 編譯功能
    const compileLatex = async () => {
        const code = editor.getValue();
        if (!code.trim()) return;

        loadingOverlay.classList.remove('hidden');
        logContainer.classList.add('hidden');
        compileBtn.disabled = true;

        try {
            const response = await fetch('/compile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });

            const result = await response.json();

            if (result.success) {
                // 成功，透過 PDF.js 渲染 PDF
                await renderPdf(result.pdfUrl);
            } else if (result.missingImages && result.missingImages.length > 0) {
                // 顯示缺圖上傳 Modal
                missingImgList.innerHTML = result.missingImages
                    .map(img => `<li>${img}</li>`).join('');
                missingImgInput.value = '';
                missingImgModal.classList.remove('hidden');
                return; // 不隱藏 loading，等待使用者上傳
            } else {
                logOutput.textContent = result.log || result.output || '發生未知錯誤';
                logContainer.classList.remove('hidden');
            }
        } catch (error) {
            console.error('編譯請求失敗:', error);
            logOutput.textContent = '無法連線到伺服器。' + error.message;
            logContainer.classList.remove('hidden');
        } finally {
            loadingOverlay.classList.add('hidden');
            compileBtn.disabled = false;
        }
    };

    compileBtn.addEventListener('click', compileLatex);

    editor.setOption("extraKeys", {
        "Ctrl-Enter": function(cm) { compileLatex(); },
        "Cmd-Enter": function(cm) { compileLatex(); }
    });

    // 使用說明 Modal
    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.getElementById('helpModal');
    const helpCloseBtn = document.getElementById('helpCloseBtn');
    helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
    helpCloseBtn.addEventListener('click', () => helpModal.classList.add('hidden'));
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) helpModal.classList.add('hidden');
    });

    // 本地檔案存取功能
    openBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        const texFile = files.find(f => f.name.endsWith('.tex'));
        const imageFiles = files.filter(f => !f.name.endsWith('.tex'));

        if (!texFile) {
            alert('請選擇至少一個 .tex 檔案');
            fileInput.value = '';
            return;
        }

        if (imageFiles.length === 0) {
            // No images — just load .tex locally (no server needed)
            const reader = new FileReader();
            reader.onload = (event) => editor.setValue(event.target.result);
            reader.readAsText(texFile);
        } else {
            // Upload .tex + images to server so compilation can find them
            const formData = new FormData();
            for (const file of files) {
                formData.append('files', file);
            }

            try {
                const res = await fetch('/upload-project', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();

                if (data.texContent) {
                    editor.setValue(data.texContent);
                }
                if (data.missingImages && data.missingImages.length > 0) {
                    alert('以下圖片在上傳中未找到：\n' + data.missingImages.join('\n'));
                }
            } catch (err) {
                console.error('上傳專案失敗:', err);
                alert('上傳失敗！');
            }
        }

        // 重置 input，允許重複選取相同檔案
        fileInput.value = '';
    });

    saveBtn.addEventListener('click', async () => {
        const content = editor.getValue();
        const title = sanitizeFilename(getDocTitle(content));

        // Check if document references any images
        const imageRegex = /\\includegraphics(?:\[.*?\])?\{([^}]+)\}/g;
        const hasImages = imageRegex.test(content);

        if (hasImages) {
            // Download as ZIP via server (includes .tex + images)
            try {
                const res = await fetch('/download-zip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: content })
                });
                if (!res.ok) throw new Error('ZIP download failed');
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${title}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (err) {
                console.error('ZIP 下載失敗:', err);
                alert('ZIP 下載失敗！');
            }
        } else {
            // No images — download plain .tex
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${title}.tex`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });

    // 處理剪貼簿圖片貼上
    editor.on('paste', (cm, event) => {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        let imageFile = null;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image/') !== -1) {
                imageFile = items[i].getAsFile();
                break;
            }
        }

        if (imageFile) {
            event.preventDefault();
            pendingImageFile = imageFile;
            pendingCursor = editor.getCursor();
            
            // 顯示 Modal 設定彈窗
            imageModal.classList.remove('hidden');
        }
    });

    imgCancelBtn.addEventListener('click', () => {
        imageModal.classList.add('hidden');
        pendingImageFile = null;
        pendingCursor = null;
    });

    imgConfirmBtn.addEventListener('click', () => {
        if (!pendingImageFile) return;

        const align = imgAlign.value;
        const width = imgWidth.value;
        const formData = new FormData();
        formData.append('image', pendingImageFile);

        const loadingText = '% [上傳圖片中...]';
        editor.replaceRange(loadingText, pendingCursor);
        
        imageModal.classList.add('hidden');

        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (data.filename) {
                const doc = editor.getDoc();
                const value = doc.getValue();
                
                let latexString = '';
                if (align === 'wrap-left') {
                    latexString = `\\begin{wrapfigure}{l}{${width}\\linewidth}
  \\centering
  \\includegraphics[width=\\linewidth]{${data.filename}}
  \\caption{圖片標題}
\\end{wrapfigure}
`;
                } else if (align === 'wrap-right') {
                    latexString = `\\begin{wrapfigure}{r}{${width}\\linewidth}
  \\centering
  \\includegraphics[width=\\linewidth]{${data.filename}}
  \\caption{圖片標題}
\\end{wrapfigure}
`;
                } else {
                    latexString = `\\begin{figure}[htbp]
  \\centering
  \\includegraphics[width=${width}\\linewidth]{${data.filename}}
  \\caption{圖片標題}
\\end{figure}
`;
                }

                const newValue = value.replace(loadingText, latexString);
                doc.setValue(newValue);
                
                // 簡單回復游標並向下移動
                editor.setCursor(pendingCursor.line + latexString.split('\n').length, 0);
            } else {
                alert('上傳失敗: ' + (data.error || '未知錯誤'));
                // 移除 loading 提示
                const doc = editor.getDoc();
                doc.setValue(doc.getValue().replace(loadingText, ''));
            }
            pendingImageFile = null;
            pendingCursor = null;
        })
        .catch(err => {
            console.error('上傳圖片錯誤:', err);
            alert('圖片上傳發生錯誤！');
            // 移除 loading 提示
            const doc = editor.getDoc();
            doc.setValue(doc.getValue().replace(loadingText, ''));
            pendingImageFile = null;
            pendingCursor = null;
        });
    });
});
