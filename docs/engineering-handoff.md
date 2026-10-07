# 棋見工程維護與模型交接手冊

> 給未來接手此專案的人類工程師或 Codex 模型。  
> 先閱讀本文件，再閱讀 `requirements-and-execution-plan.md`；以需求文件的產品範圍為準。

## 1. 專案原則

1. **Local-first 是硬需求。** PGN、FEN、分析結果不可未經明確功能需求上傳到伺服器或第三方 API。
2. **分析正確性高於華麗 UI。** 特別是黑方評分方向、將殺、升變、易位、吃過路兵、PGN 起始 FEN。
3. **不要捏造引擎理由。** Stockfish 給的是評估與變例；人類可讀的策略說明必須附可驗證的棋盤事實，並標示為規則式／推論。
4. **不要默默擴大輸入範圍。** MVP 只有貼上 PGN；帳號登入、Chess.com API 與雲端功能必須另行批准。
5. **變更要可驗證。** 每次功能改動至少跑 build；分析核心改動還要跑測試局。
6. **`main` 不是工作分支。** 只放已驗證、可交付的整合版本；每個分工從 `main` 建立獨立 branch，驗證後才合併。

## 1.1 Git 分支與整合規則

### 分支命名

```text
feature/analysis-core       Stockfish 佇列、評估、測試
feature/review-data         ReviewMove、WDL、失誤分類
feature/interactive-board  棋盤、回放、走子清單、曲線互動
feature/commentary         規則式策略旁白或本機 LLM 介面
feature/pwa-packaging      離線快取、PWA、Tauri 包裝
docs/<topic>               README、需求、交接手冊等文件
fix/<topic>                已發現的缺陷修正
```

分支名稱應描述**分工結果**，不用人名或模型名。若一個需求同時修改多個領域，仍優先拆成可獨立驗證的分支，避免把分析核心、視覺設計與打包變更混在同一次提交。

### 每項工作的流程

```bash
# 先同步已驗證的基線
git switch main
git pull --ff-only origin main

# 為一項獨立分工開 branch
git switch -c feature/<scope>

# 實作、測試、提交後推送該 branch
git push -u origin feature/<scope>
```

- `main` 禁止直接加入未完成特性、實驗、半成品 UI 或未驗證的依賴更新。
- 一個 branch 一個清楚目的；若需求改變成另一項工作，先提交／暫存當前成果，再另開 branch。
- 合併前必須重跑與風險相符的驗證，至少 `npm run build`；核心分析變更還需跑測試局。
- 每個 branch 的交接回覆需說明基準 commit、修改範圍、驗證結果與未解風險。
- 當多人或多模型同時作業時，避免在同一個 branch 上平行修改；使用不同 branch，並指定一個整合者處理衝突與合併。

### 目前 branch 狀態

`main` 是最新已整合基線。`feature/analysis-core` 已於 `d33975b` 合併；目前工作斷點是 `feature/review-data`。該分支已將 PGN 走子標準化為 `GameMove`（`beforeFen`／`afterFen`）並讓引擎 PV 逐手重播成 SAN，但尚未合併。未來實作必須從乾淨、最新的 `main` 開出相應 feature branch。

## 2. 目前技術基線

目前是 Vite + React 前端雛形，核心依賴：

| 位置 | 用途 |
| --- | --- |
| `src/App.jsx` | 頁面狀態（`game` / `analysisByPly` / `selectedPly`）、PGN 輸入、分析流程、結果呈現 |
| `src/engine.js` | Web Worker 中 Stockfish 的 UCI 訊息佇列 |
| `src/review.js` | PGN、`ReviewMove` 契約、ply 索引、評估、分類、摘要與講評的純函式 |
| `src/styles.css` | 介面樣式 |
| `vite.config.js` | 開發／打包時供應 Stockfish JS + WASM 檔案 |
| `docs/requirements-and-execution-plan.md` | 已確認需求、非目標與 phases |
| `test/engine.test.js` | Fake Worker 下的 UCI queue、cp 0、MultiPV 與取消測試 |
| `test/review.test.js` | 評分視角、WDL、終局、PGN、分類邊界、ply 0 契約、`analysisByPly` 與棋規邊界測試 |

已整合的 `feature/analysis-core`：單 Worker FIFO queue、AbortSignal 取消、Worker 錯誤重置、將殺／逼和的明確表示，以及 `npm test` 基礎測試。

`feature/review-data` 目前狀態（尚未合併）：

- `readPgn()` 輸出 `ParsedGame` = `{ headers, initialFen, moves, lastPly }`；`moves` 是含 `ply`、真實 `fullmove`、`beforeFen`、`afterFen`、`flags` 的 `GameMove`。
- `buildReviewMove({ move, best, after })` 是唯一產生 `ReviewMove` 的地方，輸出 §5 契約欄位（含 `bestWhiteCp`／`afterWhiteCp`／`lossCp`／`classification`／`whiteWinChance`／`commentary`）。`after` 可直接收 `terminalEvaluation()` 結果，終局不會被捏造成 cp 值；mate 時 `afterWhiteCp` 為 `null`。
- 分析狀態是以 ply 為 key 的物件（`withReviewMove`／`analysisAt`／`analysedPlies`），不是陣列；未分析的 ply 仍可選取且索引不位移。
- `selectedPly = 0` 是「第 1 手之前」的局面契約：`fenAtPly()` 回傳 `initialFen`（支援 `[SetUp]`／`[FEN]` 起始局面），`chanceAtPly(_, 0)` 取 ply 1 的 `best` 評估，`plyLabel(_, 0)` 為「初始局面」。
- `selectPlyView(game, analysisByPly, ply)` 是 UI 推導當前局面的唯一入口（clamp 後的 `selectedPly`、`fen`、`move`、`label`、`analysis`、`evaluation`、`whiteWinChance`、`isStart`／`isLast`）。元件不得自行保存棋盤位置。
- 失誤門檻集中在 `CLASSIFICATION_THRESHOLDS`，`classify()` 查該表；元件不得自訂 cutoff。
- `summarize()` 提供全局摘要：各分類計數、白／黑分開的平均失分與最嚴重一手。
- `chartPoints()` 從 ply 0 連續輸出到第一個尚未分析的 ply，曲線不跳號。
- `makeCommentary()` 把講評拆成 `confirmed`（引擎數值與盤面事實：子力差變化、將軍、終局）與 `inferred`（目前刻意留空），避免把規則式推論當成引擎結論。
- `replayPv()` 仍將 UCI 主變例逐著轉 SAN 並保留每一步 FEN。

重要：目前 UI 仍是概念雛形，不得因為能顯示畫面就視為可交付產品。互動棋盤、回放與變例檢視尚未實作。

## 3. 啟動、建置與品質檢查

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

- 開發模式應使用 `http://localhost`；直接雙擊 `index.html` 不會正確載入 Worker／WASM。
- `npm test` 是最低限度的核心回歸測試；`npm run build` 必須將 lite single-thread Stockfish JS 與 WASM 一併輸出。
- 不應以 CDN 載入引擎、字型或核心功能依賴。若保留外部字型，必須有本機系統字型 fallback；正式離線版應移除外部字型請求。
- 不要提交 `node_modules`、`dist`、使用者 PGN 或含個資的螢幕截圖。

## 4. 引擎與 UCI 協定

### 正確的單引擎序列

```text
new Worker
  → uci → 等 uciok
  → setoption name UCI_ShowWDL value true
  → isready → 等 readyok
  → position fen <FEN>
  → go depth <N> 或 go movetime <ms>
  → 收集最新且最深的 info ... score ... pv ...
  → bestmove ...（本次分析完成）
```

同一個 UCI Worker 不能同時跑兩個 `go`。所有分析都必須排進 queue，收到 `bestmove` 後再開始下一項。若發現程式用 `Promise.all` 對同一引擎呼叫 `analyse()`，那是 bug：要改成序列 queue 或 engine pool。

### 取消與錯誤處理

- 取消當前分析：傳 `stop`，等待 `bestmove`；超時才 terminate Worker。
- 取消整局：清除尚未開始的 queue，重置進度；不要讓舊 run 回寫新 run 的 UI。
- 使用 run ID 或 `AbortController` 防止使用者貼新 PGN 後，舊分析結果覆蓋新棋局。
- Worker 載入或 WASM 載入失敗時，顯示可行訊息與重試按鈕，而非無限轉圈。

### 引擎選擇

初版使用 `stockfish-19-lite-single`：檔案小、無需 COOP／COEP、在 Safari 也較穩定。完整多執行緒 Stockfish 需要 cross-origin isolation (`COOP: same-origin` 與 `COEP: require-corp`)；不要直接替換，必須增加啟動檢測與 fallback。

`stockfish` 及 Stockfish 本體採 GPLv3。GitHub 發佈前必須確認授權義務、保留授權／著作權資訊，並在 README 明確列出引擎來源與版本。

## 5. 棋局資料與評估不變量

### `ReviewMove` 欄位（`buildReviewMove()` 的實際輸出）

```ts
type ReviewMove = {
  ply: number;                 // 1 起算的半回合；ply 0 保留給初始局面
  fullmove: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
  flags: string;               // chess.js 旗標（易位、en passant、升變…）
  beforeFen: string;
  afterFen: string;
  best: Evaluation;            // beforeFen 的分析，已正規化為白方視角
  actual: Evaluation;          // afterFen 的分析或 terminalEvaluation()
  bestWhiteCp: number | null;  // mate 時為 null，不可偽裝成兵值
  afterWhiteCp: number | null;
  bestSan: string;             // 引擎 bestmove 在 beforeFen 重播後的 SAN
  pv: { moves: PvMove[]; error: string | null };
  lossCp: number | null;       // 一律為走子方的非負損失
  classification: { label: string; tone: Tone };
  whiteWinChance: number | null;
  commentary: { confirmed: string[]; inferred: string[] };
};
```

`analysisByPly` 是 `Record<ply, ReviewMove>`；ply 0 沒有 `ReviewMove`，其評估由 `chanceAtPly()`／`evaluationAtPly()` 取 ply 1 的 `best`。

### 視角規則（絕不可違反）

Stockfish 的 `score cp`／`score mate`／`wdl` 是**該 FEN 輪到走的一方的視角**，不是固定白方視角。每筆引擎結果都必須先依 FEN turn 正規化：白方待走保留；黑方待走時反轉 cp／mate 符號，並將 WDL 的 win、loss 互換。UI 的「白方勝率」採 WDL 期望得分 `(win + draw / 2) / total`；這比純 win 機率更符合含大量和局的棋局檢討曲線。

正規化後，設 `B` 是實戰前的最佳白方分數，`A` 是實戰後白方分數：

```text
白方走：loss = max(0, B - A)
黑方走：loss = max(0, A - B)
```

分析 `afterFen` 時輪到對手走；必須先在 `afterFen` 做上述正規化，再套用走子者的 loss 公式。mate 以獨立 `score.kind === 'mate'` 呈現 `#N`／`-#N`，不可在 UI 把內部比較用的數值顯示為幾百兵。

### 棋規邊界測試清單

- 標準開局 PGN。
- `[SetUp "1"]` + `[FEN "..."]` 的非標準起始局面。
- 白／黑王車易位。
- en passant。
- 升變（含 `=Q` 以外的升變）。
- 將軍、將死、逼和與不合法 PGN。
- 不同結果標頭（`1-0`、`0-1`、`1/2-1/2`、`*`）。

## 6. 講評策略

第一版不依賴雲端 LLM。講評產生器應接收結構化事實，不直接「根據 CP 猜故事」：

```text
局面特徵（子力差、是否將軍、被攻擊／未保護子、王安全、兵形、中心控制）
  + 實戰著與最佳著差異
  + PV 中立即可見的戰術結果
  → 有信心等級的白話講評
```

範例用語：

- 可確認：`這步後白方少了一個兵，且引擎評估從 +0.8 變成 -1.6。`
- 推論：`這也讓黑方更容易在后翼建立通兵。`
- 不可宣稱：`你忽略了長期計畫`（除非有具體證據與明確定義）。

若日後加入 Ollama 等本地 LLM，必須是「可選後處理」；引擎評分、最佳著和核心功能仍須在沒有 LLM 時運作。

## 7. UI 狀態模型

最少維護以下獨立狀態：

```text
draftPgn       使用者正在編輯的 PGN
parsedGame     已成功驗證的棋局
analysisRun    { id, status, progress, abortController }
review[]       已完成或逐步完成的 ReviewMove
selectedPly    當前棋盤、走子清單與旁白共享的選取位置
settings       深度／時間、使用者執子顏色（未來）
```

不要把棋盤位置各自存在圖表、走子清單、旁白元件；所有互動都應寫回唯一的 `selectedPly`。棋盤 FEN 從資料模型推導。

## 8. 建議的下一位模型工作順序

1. 讀本文件與需求文件，執行 `npm test && npm run build`，先確認基線。
2. [完成於 `feature/analysis-core`] 單一 UCI Worker 的 FIFO queue、取消、run ID 與錯誤復原。
3. [完成基礎版] `node:test` 針對 engine／review pure functions；`feature/review-data` 已補上 ply 0、`analysisByPly`、黑方失誤與棋規邊界（將死、升變、易位、en passant、非法 PGN、自訂起始 FEN）fixtures。
4. [完成於 `feature/review-data`] `GameMove`／`ParsedGame` 統一為 `beforeFen`／`afterFen`，PV 逐手重播成 SAN。
5. [完成於 `feature/review-data`] `App.jsx` 已改為 `ParsedGame + analysisByPly + selectedPly`（`selectedPly = 0` 為初始局面）；集中化 `CLASSIFICATION_THRESHOLDS`，加入 `summarize()` 全局摘要與 `confirmed`／`inferred` 分離的 `commentary`。本分支刻意不加播放 UI。
6. **下一步：**將此資料分支合併到 `main` 後，另開 `feature/interactive-board`：真正的棋盤元件與棋子圖示、走子清單、前後步與播放、曲線跳轉，全部只透過唯一的 `selectedPly` 互動；同時補上主變例檢視。
7. 最後才加策略旁白（填入 `commentary.inferred`）、PWA 和 Tauri。

每一步完成時，更新本手冊的「目前技術基線」和需求文件對應 phase checkbox，並在回覆中列出執行過的驗證命令與結果。

## 8.1 目前接手斷點（2026-10-07）

```md
## 交接摘要
- 完成：`main` 已有可取消的本機 Stockfish 分析核心；`feature/review-data` 已完成 `ReviewMove` 資料契約——以 ply 索引的 `analysisByPly`、`selectedPly = 0` 初始局面、集中化失誤門檻、`summarize()` 全局摘要、`confirmed`／`inferred` 分離的 commentary，以及棋規邊界測試。
- 未完成：沒有真正的互動棋盤／回放 UI、沒有主變例檢視、沒有策略旁白（`commentary.inferred` 仍為空）、沒有 PWA／Tauri 包裝、沒有 MultiPV 與關鍵點重分析。
- 目前 branch：`feature/review-data`（已可驗證，待合併到 `main`；勿直接在 main 修改）。
- 最近一次驗證：`npm test`（16 passed / 0 failed）與 `npm run build` 皆通過；接手前務必重跑。
- 已知限制：UI 仍是概念雛形（純文字棋子、無播放）；曲線只畫到第一個未分析的 ply；「勝率」實際上是 WDL 期望得分，文案已改為「白方期望得分（引擎估計）」；深度選項仍是固定 depth，未實作需求文件 §7 的關鍵點時間分配。
- 下一步（唯一最高優先）：把 `feature/review-data` 合併進 `main`，再開 `feature/interactive-board`，讓棋盤、走子清單與曲線共用唯一的 `selectedPly`。
```

## 9. GitHub 準備清單

- 加入 `.gitignore`：`node_modules/`、`dist/`、`.DS_Store`、`*.pgn`（若不想意外提交個人棋譜）。
- 寫 README：本機啟動方式、隱私承諾、Stockfish 授權、已知限制。
- 用匿名、可公開的測試 PGN；不要把自己的 Chess.com 使用者名稱或對局放進 sample。
- GitHub Actions 至少執行安裝、測試、`npm run build`。
- 發佈前以斷網環境測試已建置 app，確定沒有隱性 API／CDN 依賴。

## 10. 接手時的回報格式

每位模型在交接或完成一個 phase 時，用以下格式回報：

```md
## 交接摘要
- 完成：
- 未完成：
- 改動檔案：
- 驗證：
- 已知風險／技術債：
- 下一步（唯一最高優先）：
```

這份摘要應簡潔、可驗證，避免以「應該可行」取代實際測試結果。
