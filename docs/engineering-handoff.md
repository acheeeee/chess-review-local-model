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
| `src/App.jsx` | 頁面狀態（`game` / `analysisByPly` / `selectedPly` / `variationIndex` / `orientation` / `playing`）、PGN 輸入、分析流程、結果呈現 |
| `src/engine.js` | Web Worker 中 Stockfish 的 UCI 訊息佇列 |
| `src/review.js` | PGN、`ReviewMove` 契約、ply 索引、評估、分類、摘要與講評的純函式 |
| `src/facts.js` | 可驗證的盤面事實：子力差、攻守子數、鬆子、兵形、王前兵盾、中心控制、出子數 |
| `src/commentary.js` | 規則式策略旁白（`inferred`）與主變例事實（`pvSignals`） |
| `src/navigation.js` | 棋盤格子推導、前後步、走子清單列、變例預覽的純函式 |
| `src/pieces.jsx` | 本專案原創的 SVG 棋子圖示（無第三方素材、無網路請求） |
| `src/styles.css` | 介面樣式 |
| `vite.config.js` | 開發／打包時供應 Stockfish JS + WASM 檔案 |
| `tools/visual-preview.jsx`／`.mjs` | `npm run preview:ui`：用假引擎結果靜態渲染真實元件，輸出 `preview/review-ui.html` 供視覺檢查 |
| `docs/requirements-and-execution-plan.md` | 已確認需求、非目標與 phases |
| `test/engine.test.js` | Fake Worker 下的 UCI queue、cp 0、MultiPV 與取消測試 |
| `test/review.test.js` | 評分視角、WDL、終局、PGN、分類邊界、ply 0 契約、`analysisByPly` 與棋規邊界測試 |
| `test/navigation.test.js` | 棋盤格色／翻轉／高亮、步進邊界、走子清單配對、變例預覽測試 |
| `test/commentary.test.js` | 盤面事實（攻守子數、鬆子、兵形、王盾、中心、出子）與規則式旁白的證據測試 |

已整合的 `feature/analysis-core`：單 Worker FIFO queue、AbortSignal 取消、Worker 錯誤重置、將殺／逼和的明確表示，以及 `npm test` 基礎測試。

`feature/review-data`（已合併 `main`）確立的資料契約：

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

`feature/interactive-board` 新增的互動層（全部建立在 `selectedPly` 之上）：

- `boardView(fen, { orientation, lastMove, suggestion })` 產生 64 格的顯示順序資料：格色（a1 為深色）、座標標籤、實戰著起訖與引擎建議起訖分開標記。棋盤元件只負責畫，不自行算位置。
- `interactiveBoard()` 是棋盤的唯一推導入口：無變例時顯示實戰局面並只標實戰著；`variationIndex` 有值時改顯示引擎主變例局面，且以「建議」配色標記，介面必須同時顯示「變例預覽」標籤。實戰盤面永遠不會把建議著畫成好像發生過。
- `stepPly()`／`canStep()` 把前後步、⏮／⏭、鍵盤 ←／→／Home／End 與自動播放限制在 `0..lastPly`。
- `moveRows()` 以 fullmove 配對白黑；黑先開局（`[FEN]` 起始）不會錯位，未分析的手仍有可點選的格子。
- 播放是 `playing` 狀態 + `setTimeout`（`PLAYBACK_MS`），到最後一手自動停止；任何手動操作都會停止播放。
- 棋子是 `src/pieces.jsx` 的原創 SVG；國王、主教、皇后外形刻意區分（已用視覺預覽確認），黑子的十字／切口以淺色描邊維持對比。

重要：介面已可操作（真棋子、回放、曲線跳轉、變例預覽），但策略旁白、關鍵點重分析與離線打包仍未完成，尚不是可交付的完整產品。

## 3. 啟動、建置與品質檢查

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
npm run preview:ui   # 靜態介面預覽，不需要引擎
```

- 開發模式應使用 `http://localhost`；直接雙擊 `index.html` 不會正確載入 Worker／WASM。
- `npm test` 是最低限度的核心回歸測試；`npm run build` 必須將 lite single-thread Stockfish JS 與 WASM 一併輸出。
- 改到棋盤、棋子或走子清單樣式時，跑 `npm run preview:ui` 並實際看一遍 `preview/review-ui.html`（含桌面與約 500px 窄寬度）；`preview/` 已被 git 忽略。
- 不應以 CDN 載入引擎、字型或核心功能依賴。若保留外部字型，必須有本機系統字型 fallback；正式離線版應移除外部字型請求。
- 不要提交 `node_modules`、`dist`、`preview`、使用者 PGN 或含個資的螢幕截圖。

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

### 目前實作（`feature/commentary`）

`makeCommentary()` 產生兩組句子，UI 分區顯示且推論區塊標明「非引擎結論」：

- `confirmed`：實戰著與走後評估、引擎首選與差距（兵）、子力差變化、將軍／將死／判和，以及 `pvSignals()` 從主變例本身讀出的事實（主變例以吃子開頭、幾步內將死）。
- `inferred`：`inferredSignals()` 的規則式判讀，依優先序最多 3 句，每句都必須帶出處數字：
  1. 落點安全：剛走到的子被 N 攻 M 守。
  2. 新增鬆子：某格由 N 攻 M 守變成戰術目標。
  3. 王安全：失去易位權、王前兵數減少、王所在列已無自己的兵。
  4. 兵形：新增疊兵／孤兵／通兵（附列名或格位與前後數量）。
  5. 機會：對手某子目前 N 攻 M 守。
  6. 空間：中心四格控制值變化 ≥ 2；開局（ply ≤ 20）多出動一個子。

規則來源全部在 `src/facts.js`，每個事實函式都有單元測試。新增規則時：必須能用盤面查證、必須在句子裡寫出數字、不得引用引擎沒有輸出的內容；已將死的局面不產生任何推論。

若日後加入 Ollama 等本地 LLM，必須是「可選後處理」；引擎評分、最佳著和核心功能仍須在沒有 LLM 時運作。

## 7. UI 狀態模型

最少維護以下獨立狀態：

```text
pgn            使用者正在編輯的 PGN
game           已成功驗證的 ParsedGame
analysisRun    { id, controller }（ref，不進 render 狀態）
analysisByPly  Record<ply, ReviewMove>，可部分完成
selectedPly    棋盤、曲線、走子清單與旁白共享的唯一選取位置（0 = 初始局面）
variationIndex null = 看實戰；數字 = 預覽引擎主變例第 N 步
orientation    'w' | 'b' 棋盤視角
playing        自動回放開關
settings       深度／時間、使用者執子顏色（未來）
```

不要把棋盤位置各自存在圖表、走子清單、旁白元件；所有互動都應寫回唯一的 `selectedPly`（App 的 `selectPly()` 同時清掉 `variationIndex`，避免變例殘留到下一手）。棋盤 FEN 一律由 `interactiveBoard()` 從資料模型推導。

## 8. 建議的下一位模型工作順序

1. 讀本文件與需求文件，執行 `npm test && npm run build`，先確認基線。
2. [完成於 `feature/analysis-core`] 單一 UCI Worker 的 FIFO queue、取消、run ID 與錯誤復原。
3. [完成基礎版] `node:test` 針對 engine／review pure functions；`feature/review-data` 已補上 ply 0、`analysisByPly`、黑方失誤與棋規邊界（將死、升變、易位、en passant、非法 PGN、自訂起始 FEN）fixtures。
4. [完成於 `feature/review-data`] `GameMove`／`ParsedGame` 統一為 `beforeFen`／`afterFen`，PV 逐手重播成 SAN。
5. [完成於 `feature/review-data`] `App.jsx` 已改為 `ParsedGame + analysisByPly + selectedPly`（`selectedPly = 0` 為初始局面）；集中化 `CLASSIFICATION_THRESHOLDS`，加入 `summarize()` 全局摘要與 `confirmed`／`inferred` 分離的 `commentary`。
6. [完成於 `feature/interactive-board`] 原創 SVG 棋子、`boardView`／`interactiveBoard` 推導、走子清單配對、前後步＋播放＋鍵盤、曲線點跳轉、主變例逐步預覽，全部共用 `selectedPly`；新增 `npm run preview:ui` 視覺檢查。
7. [完成於 `feature/commentary`] `src/facts.js` 盤面事實 + `src/commentary.js` 規則式推論，寫入 `commentary.inferred` 並在 UI 標示為非引擎結論。
8. **下一步：**需求文件 §7 的「深入模式」——在 `feature/analysis-core` 系列分支擴充引擎層：關鍵點（大失誤／評估劇變）以較長 movetime 或 MultiPV 重跑，並讓 `parseInfo` 收集 multipv > 1 的候選著。
9. 最後才做 `feature/pwa-packaging`（離線快取、PWA、可選 Tauri）與 GitHub Actions。

每一步完成時，更新本手冊的「目前技術基線」和需求文件對應 phase checkbox，並在回覆中列出執行過的驗證命令與結果。

## 8.1 目前接手斷點（2026-10-07）

```md
## 交接摘要
- 完成：`main` 已有可取消的本機 Stockfish 分析核心、完整 `ReviewMove` 資料契約，以及 Chess.com 式互動檢討介面（原創 SVG 棋子、高亮、翻轉、回放、鍵盤、曲線跳轉、走子清單、主變例預覽）。`feature/commentary` 新增 `src/facts.js`（可查證盤面事實）與 `src/commentary.js`（規則式推論最多 3 句、每句附數字依據），UI 以獨立區塊標示「規則式推論（非引擎結論）」。
- 未完成：需求 §7 的深入模式（關鍵點以較長 movetime／MultiPV 重跑）、MultiPV 解析、PWA／離線快取／Tauri、GitHub Actions、IndexedDB 保存（目前刻意不存）、本機 LLM 後處理（可選、非 MVP）。
- 目前 branch：`feature/commentary`（已可驗證，待合併）。
- 最近一次驗證：`npm test`（34 passed / 0 failed）、`npm run build`、`npm run preview:ui` 並實際檢視旁白區塊與棋盤；接手前務必重跑。
- 已知限制：規則式推論只看單一局面的靜態特徵，沒有做 SEE 或戰術搜尋，可能漏掉需要算變化才看得出的威脅（因此句子一律標為推論並附數字）；深度仍是固定 depth 選項；變例只有主變例。
- 下一步（唯一最高優先）：合併 `feature/commentary` 後，依需求 §7 實作深入模式——對大失誤與評估劇變的 ply 以較長思考時間／MultiPV 重分析，並在 UI 呈現多條替代變例。
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
