document.addEventListener('DOMContentLoaded', () => {
    // 預設的 LaTeX 模板
    const defaultCode = `\\documentclass[12pt, a4paper]{ctexart}
\\usepackage{amsmath, amssymb}
\\usepackage{tikz}
\\usepackage{graphicx}
\\usepackage{wrapfig} % 支援文繞圖

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

    // 渲染 PDF
    const renderPdf = async (url) => {
        try {
            pdfViewer.innerHTML = ''; // 清空舊內容
            const loadingTask = pdfjsLib.getDocument(url);
            currentPdfDoc = await loadingTask.promise;

            // 依序渲染每一頁
            for (let pageNum = 1; pageNum <= currentPdfDoc.numPages; pageNum++) {
                const page = await currentPdfDoc.getPage(pageNum);
                
                // 設定縮放比例 (預設 1.2 以適合大部分螢幕)
                const viewport = page.getViewport({ scale: 1.2 });

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
                pageContainer.appendChild(textLayerDiv);

                pdfjsLib.renderTextLayer({
                    textContent: textContent,
                    container: textLayerDiv,
                    viewport: viewport,
                    textDivs: []
                });
            }
        } catch (error) {
            console.error('PDF 渲染錯誤:', error);
        }
    };

    // 處理反向搜尋點擊事件
    pdfViewer.addEventListener('mouseup', async (e) => {
        const selection = window.getSelection();
        if (selection.toString().length > 0) return; // 使用者正在選取文字則不觸發

        // 找尋點擊位置屬於哪一頁
        const pageContainer = e.target.closest('.page');
        if (!pageContainer) return;

        const pageNum = parseInt(pageContainer.getAttribute('data-page-number'), 10);
        const rect = pageContainer.getBoundingClientRect();
        
        // 取得相對於頁面左上角的座標 (Points)
        // PDF.js 預設 72 PPI，1 Point = 1/72 inch
        const scale = 1.2; // 上面設定的縮放比例
        
        // 將 CSS 像素轉換為 PDF 的點座標 (Pt)
        const xPt = (e.clientX - rect.left) / scale;
        const yPt = (e.clientY - rect.top) / scale;

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

    // 本地檔案存取功能
    openBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            editor.setValue(event.target.result);
        };
        reader.readAsText(file);
        
        // 重置 input，允許重複選取相同檔案
        fileInput.value = '';
    });

    saveBtn.addEventListener('click', () => {
        const content = editor.getValue();
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'document.tex';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
