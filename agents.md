# Agents Guide

本文件提供 AI 代理（如 Claude Code）在此儲存庫中工作所需的關鍵資訊。

## 專案概述

EzLatex 是一個網頁版 LaTeX 編輯器，採用 Node.js + Express 後端搭配純 HTML/CSS/JS 前端。後端呼叫系統安裝的 `xelatex` 進行編譯，並以 SyncTeX 實現 PDF 與原始碼的雙向定位。

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
- 編譯工作目錄為 `temp/`，產出 `main.pdf`、`main.log` 等暫存檔
- 圖片上傳以時間戳記命名（`img_<timestamp>_<random>.png`），存於 `temp/`
- SyncTeX 查詢使用 `exec('synctex query ...')`，解析輸出取得行號

### 前端（`public/`）

- `index.html`：單頁應用，載入 CodeMirror 與 PDF.js CDN 資源
- `script.js`：處理編譯觸發、PDF 渲染、反向搜尋、圖片貼上邏輯
- `style.css`：深色主題（Slate 900 色系），使用 CSS 自訂屬性

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

- 工具列按鈕在 `index.html` 的 `<div class="toolbar">` 內新增
- 對應的事件處理邏輯在 `script.js` 底部新增
- 樣式統一使用 `style.css` 中已定義的 CSS 變數（如 `var(--accent)`）

### 調整 LaTeX 編譯選項

`server.js` 中的 `xelatex` 呼叫：

```js
const proc = spawn('xelatex', [
  '-interaction=nonstopmode',
  '-synctex=1',
  'main.tex'
], { cwd: TEMP_DIR })
```

若需要更改引擎或加入額外參數，修改此處即可。

## 注意事項

- `temp/` 目錄已在 `.gitignore` 中排除，不應提交其中的編譯產物
- 前端使用 CDN 引入 CodeMirror 與 PDF.js，不在 `node_modules` 中管理
- 中文支援依賴系統字型與 `ctexart` 文件類別，修改預設範本時請保留 `\documentclass{ctexart}`
- 伺服器沒有身份驗證機制，設計為本機開發工具使用

## 相依套件

| 套件 | 版本 | 用途 |
|------|------|------|
| express | ^5.2.1 | HTTP 伺服器與路由 |
| multer | ^2.1.1 | 圖片上傳（multipart/form-data） |
| cors | ^2.8.6 | 跨來源請求支援 |

外部系統相依（需另行安裝）：

- `xelatex`：LaTeX 編譯引擎
- `synctex`：PDF 與原始碼雙向定位
