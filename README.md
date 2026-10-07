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

## 檢討介面操作

- 棋盤下方：⏮ 回到初始局面、◀ ▶ 前後一步、▶／⏸ 自動播放、⏭ 跳到最後一手、⇅ 翻轉視角。
- 鍵盤：← → 前後一步，Home／End 跳到頭尾。
- 點勝率曲線的節點、或點右側走子清單的任一手，都會切換到同一個局面；尚未分析完成的手也可以先瀏覽棋盤。
- 「引擎建議」後方的著法可逐步預覽引擎主變例；預覽時棋盤會標示為「變例預覽」，按「回到實戰」即可返回。

## 旁白怎麼讀

每一手的講評分成兩層，不會混在一起：

- 上層是**可查證的事實**：實戰著與走後評估、引擎首選與差距、子力變化、將軍／將死，以及引擎主變例本身顯示的結果。
- 下層標示「規則式推論（非引擎結論）」：由固定規則依落點安全、鬆子、王安全、兵形與中心控制產生，最多三句，每句都寫出判斷依據的數字（例如「被 2 子攻擊、只有 1 子保護」）。

這些推論只看單一局面的靜態特徵，沒有做戰術搜尋，所以可能漏掉需要算變化才看得出的威脅。要確認棋理時，請以引擎評估與變例為準。

## 介面預覽（不需引擎）

```bash
npm run preview:ui
```

以假的引擎結果靜態渲染檢討介面並輸出 `preview/review-ui.html`，用來快速檢查棋盤、棋子與走子清單的樣式。

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
