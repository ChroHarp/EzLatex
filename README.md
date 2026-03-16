# EzLatex

一個輕量級的網頁版 LaTeX 編輯器，支援即時編譯、PDF 預覽、中文排版，以及雙向同步搜尋。

## 功能特色

- **語法高亮編輯器** — 基於 CodeMirror 5，提供 LaTeX 語法著色（Dracula 主題）、括號匹配、自動補全
- **即時 PDF 預覽** — 使用 XeTeX 編譯，透過 PDF.js 直接在瀏覽器中渲染
- **反向搜尋（SyncTeX）** — 點擊 PDF 中的文字，自動跳至編輯器對應行
- **圖片貼上插入** — 直接 Ctrl+V 貼上剪貼簿圖片，自動產生 LaTeX 圖片環境程式碼
- **中文支援** — 使用 `ctexart` 文件類別，完整支援中文排版與字型
- **錯誤訊息顯示** — 編譯失敗時顯示 XeTeX 完整日誌，方便除錯
- **檔案操作** — 開啟本機 `.tex` 檔案、將原始碼儲存為 `.tex` 檔案

## 螢幕截圖

左側為 CodeMirror 編輯區，右側為 PDF 預覽區，支援分割拖曳調整寬度。

## 環境需求

| 項目 | 版本需求 |
|------|----------|
| Node.js | 18+ |
| npm | 8+ |
| XeTeX | 任意版本（含 `xelatex` 指令） |
| SyncTeX | 通常隨 TeX Live / MiKTeX 安裝 |

> **提示：** Windows 使用者可透過 [MiKTeX](https://miktex.org/) 安裝 XeTeX；macOS/Linux 使用者可透過 [TeX Live](https://www.tug.org/texlive/) 安裝。

## 安裝與執行

```bash
# 1. 複製儲存庫
git clone https://github.com/ChroHarp/EzLatex.git
cd EzLatex

# 2. 安裝相依套件
npm install

# 3. 啟動伺服器
node server.js
```

開啟瀏覽器前往 `http://localhost:3000` 即可使用。

若需指定連接埠：

```bash
PORT=8080 node server.js
```

## 使用方式

| 操作 | 方式 |
|------|------|
| 編譯 | `Ctrl+Enter`（macOS：`Cmd+Enter`） |
| 開啟檔案 | 工具列「開啟」按鈕，選取 `.tex` 檔 |
| 儲存檔案 | 工具列「儲存」按鈕 |
| 插入圖片 | 在編輯器中 `Ctrl+V` 貼上剪貼簿圖片 |
| 反向搜尋 | 點擊 PDF 預覽中的文字 |

## 專案結構

```
EzLatex/
├── server.js          # Express 後端伺服器
├── package.json       # Node.js 相依套件設定
├── public/
│   ├── index.html     # 主介面
│   ├── script.js      # 前端邏輯
│   └── style.css      # 樣式表
├── temp/              # 編譯暫存目錄（.gitignore 排除）
└── tex/               # 範例 LaTeX 文件
```

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/compile` | 接收 `{ code }` JSON，編譯 LaTeX 並回傳 PDF 路徑或錯誤日誌 |
| `GET` | `/pdf` | 取得最新編譯的 PDF 檔案 |
| `GET` | `/synctex` | 依 `?page=&x=&y=` 查詢 PDF 座標對應的原始碼行號 |
| `POST` | `/upload` | 上傳圖片（multipart），回傳儲存的檔名 |

## 技術棧

- **前端：** HTML5、CSS3、Vanilla JavaScript、CodeMirror 5、PDF.js
- **後端：** Node.js、Express 5、Multer、CORS
- **LaTeX 引擎：** XeTeX（xelatex）、SyncTeX

## 授權

MIT License
