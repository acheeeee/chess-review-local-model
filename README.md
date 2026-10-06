# 棋見（Chess Insight）

本機優先的西洋棋棋局檢討工具。將 Chess.com 對局的 PGN 貼入後，工具會在你的 Mac 上以 Stockfish 分析每一步，提供勝率走勢、最佳著、失誤分類與可互動回放。

> 專案目前處於開發初期。完整範圍與實作順序請見 [`docs/requirements-and-execution-plan.md`](docs/requirements-and-execution-plan.md)。

## 隱私

- PGN 與棋局分析在本機瀏覽器／CPU 內處理。
- 不需要登入 Chess.com，也不會將棋譜上傳到本專案的伺服器。
- 第一次安裝 npm 套件需要網路；完成建置後，核心分析功能設計為可離線運作。

## 本機啟動

需要 Node.js 20 以上與 npm。

```bash
npm install
npm run dev
```

開啟終端機顯示的本機網址（通常是 `http://localhost:5173`）。請不要直接雙擊 `index.html`，否則瀏覽器可能無法載入本機 Stockfish Worker。

## 建置與預覽

```bash
npm run build
npm run preview
```

`npm run build` 會把 Stockfish WebAssembly 引擎與網頁程式一併輸出至 `dist/`。

## 專案文件

- [需求與執行計畫](docs/requirements-and-execution-plan.md)：產品決策、MVP 範圍、實作階段與驗收標準。
- [工程維護與模型交接手冊](docs/engineering-handoff.md)：架構、引擎協定、資料正確性規則、測試清單與交接格式。

## 授權與第三方元件

- 棋局規則與 PGN 解析：[`chess.js`](https://github.com/jhlywa/chess.js)。
- 棋力分析：Stockfish 19 WebAssembly，由 [`stockfish.js`](https://github.com/nmrugg/stockfish.js) 提供。Stockfish／stockfish.js 採 GPLv3；發佈或散布建置成果前，請保留其授權與著作權聲明，並確認完整的 GPL 相容義務。

本專案本身的授權尚未決定；在決定前，請不要假設可以自由再散布其原始碼或建置檔。
