# Agents Guide

本文件提供 AI 代理（如 Claude Code）在此儲存庫中工作所需的關鍵資訊。

## 專案概述

EzLaTeX 是一個網頁版 LaTeX 編輯器，採用 Node.js + Express 後端搭配純 HTML/CSS/JS 前端。後端呼叫系統安裝的 `xelatex` 進行編譯，並以 SyncTeX 實現 PDF 與原始碼的雙向定位。

## 開發環境設定

```bash
npm install       # 安裝相依套件
node server.js    # 啟動開發伺服器，預設 port 3000
```

測試編譯端點：

```bash
node test_req.js  # 對 /compile 發送測試請求
```

## 架構說明

### 後端（`server.js`）

- 使用 `spawn('xelatex', ...)` 編譯，避免 shell injection
- 編譯工作目錄為 `temp/`，產出 `main.pdf`、`main.log`、`main.synctex.gz` 等暫存檔
- **缺圖偵測**：`/compile` 端點在執行編譯前，先掃描 `\includegraphics` 指令並比對 `temp/` 目錄，若有缺少圖片則直接回傳 `{ success: false, missingImages: [...] }`，不進行編譯
- **圖片上傳**（`/upload`）：接收單張圖片，以時間戳記命名（`img_<timestamp><random>.<ext>`），存於 `temp/`
- **專案上傳**（`/upload-project`）：接收 `.tex` + 圖片組合（最多 50 個檔案），以原始檔名存入 `temp/`，回傳 `{ texContent, uploadedImages, missingImages }`
- **ZIP 下載**（`/download-zip`）：接收 `{ code }`，掃描 `\includegraphics` 引用，將 `.tex` 與圖片打包成 ZIP 回傳；缺少的圖片列入 `_missing_images.txt`
- **SyncTeX 查詢**（`/synctex`）：使用 `exec('synctex edit ...')`，解析輸出取得原始碼行號；自動偵測 MiKTeX 或系統 PATH 的 synctex 位置
- **xelatex 路徑解析**：優先使用系統 PATH 中的 `xelatex`，若找不到則 fallback 至 MiKTeX 預設安裝路徑 `%LOCALAPPDATA%\Programs\MiKTeX\...`

### 前端（`public/`）

- `index.html`：單頁應用，載入 CodeMirror 5 與 PDF.js CDN 資源；包含三個 Modal：圖片插入設定、缺圖補充上傳、使用說明
- `script.js`：處理編譯觸發、PDF 渲染、反向搜尋、圖片貼上、檔案開啟/儲存/匯出邏輯
- `style.css`：深色主題（Slate 900 色系），使用 CSS 自訂屬性

### 檔案命名邏輯

匯出的 `.tex`、`.zip`、`.pdf` 檔名依以下優先順序決定：
1. `\title{...}` 的內容
2. 第一個 `\section{...}` 或 `\section*{...}` 的內容
3. 預設名稱（`document`）

### Modal 清單

| ID | 用途 |
|----|------|
| `imageModal` | 圖片插入設定（排版方式、大小比例） |
| `missingImgModal` | 編譯前偵測到缺少圖片時，提示補充上傳 |
| `helpModal` | 使用說明（操作方式、快捷鍵、圖片處理流程） |

## 修改指引

### 新增後端端點

在 `server.js` 中以 `app.get()` / `app.post()` 新增路由，遵循現有的錯誤回傳格式：

```js
// 成功
res.json({ success: true, data: ... })

// 失敗
res.json({ success: false, log: errorMessage })
```

### 修改前端 UI

- 工具列按鈕在 `index.html` 的 `<div class="header-right">` 內新增
- Modal 在 `<script src="script.js">` 之前新增 HTML，並在 `script.js` 中加對應事件
- 樣式統一使用 `style.css` 中已定義的 CSS 變數（如 `var(--accent)`）

### 調整 LaTeX 編譯選項

`server.js` 中的 `xelatex` 呼叫：

```js
const proc = spawn(XELATEX, [
  '-interaction=nonstopmode',
  '-synctex=1',
  'main.tex'
], { cwd: tempDir })
```

若需要更改引擎或加入額外參數，修改此處即可。

## 注意事項

- `temp/` 目錄已在 `.gitignore` 中排除，不應提交其中的編譯產物
- 前端使用 CDN 引入 CodeMirror 5 與 PDF.js，不在 `node_modules` 中管理
- 中文支援依賴系統字型，預設範本使用 `ctexart` + `Noto Sans TC`；`article + xeCJK + \setCJKmainfont` 組合同樣支援
- 伺服器沒有身份驗證機制，設計為本機開發工具使用
- 專案上傳（`/upload-project`）以**原始檔名**存入 `temp/`，與圖片插入（`/upload`）的時間戳記命名不同，修改相關邏輯時需注意

## 相依套件

| 套件 | 版本 | 用途 |
|------|------|------|
| express | ^5.2.1 | HTTP 伺服器與路由 |
| multer | ^2.1.1 | 圖片上傳（multipart/form-data） |
| cors | ^2.8.6 | 跨來源請求支援 |
| archiver | ^7.0.1 | 打包 ZIP（`.tex` + 圖片下載） |

外部系統相依（需另行安裝）：

- `xelatex`：LaTeX 編譯引擎
- `synctex`：PDF 與原始碼雙向定位
