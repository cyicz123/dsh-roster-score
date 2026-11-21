# dsh-roster-score 教师成绩语音录入

在 DSH 里用「念名字 → 说分数 → 回读确认」的方式把成绩录进学生花名册，最后导出原表加一列成绩的表格。

- 语音识别：DSH 自带的本地 SenseVoice（`sensevoice-local`），首次使用会自动下载模型（约 228 MB）。
- 朗读：系统自带中文语音（Windows SAPI，通过浏览器 `speechSynthesis`）。
- 表格解析：交给当前会话默认模型（`ctx.llm.stream`），不写死列名规则。
- 数据：状态存在 `%DSH_HOME%\roster-score\state.json`，原表另存一份 `source.<ext>` 供导出用。

## 用法

1. 刷新 DSH 页面，左侧栏点「成绩录入」。
2. 把 `.xlsx` / `.csv` 花名册拖进面板（或点「选择文件」）。
3. 等解析完成，面板显示名单与「当前学生」大字卡片。
4. 点「开始录入」，听到名字后直接说分数（如「八十五」「85」「九十六分」都行）。
5. 说完会自动识别、回读「姓名，85分」，然后自动跳下一位。
6. 有听错的：在表格里点那一格直接改；没听清的会被标红并可手工补。
7. 点「导出成绩」得到 `原文件名-成绩.xlsx`。

## 设置（右侧浮动面板）

- 倒序录入：表格顺序不变，只从最后一位开始念。
- 成绩列名：导出时新增列的标题，默认「成绩」。
- 分值范围：默认 0–100，超出范围会当作没听清处理。
- 回读内容：默认「姓名 + 成绩」，可改「只念成绩」。
- 没听清时重问：默认 2 次。
- 朗读速度。
- 朗读声库自检 + 试听。

## 接口（Host 侧，前缀 `/plugins/roster-score`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/state` | 当前名单、成绩、设置 |
| POST | `/parse` | `{fileName, dataBase64}` 解析花名册（返回当前视图） |
| POST | `/score` | `{id, score, skipped}` 记一条成绩 |
| POST | `/settings` | 改设置 |
| POST | `/reset` | 清空 |
| POST | `/export` | 返回 `{fileName, base64}` |
| GET | `/speech` | 语音识别提供方状态 |
| POST | `/speech/prepare` | 触发模型准备（即发即返，前端轮询 `/speech`） |
| POST | `/transcribe` | `{audioBase64, language}` → `{text}` |

## 目录结构

```
dsh-roster-score/
├── index.js          Host 半：webServer 路由、LLM 解析、xlsx/CSV 导出、状态落盘
├── client.js         Client 半：整页面板、语音循环、表格、右侧设置抽屉
├── lib/xlsx.mjs      零依赖 xlsx 读写（zip + sheet XML）
├── locale/           zh / en 词典
├── samples/          样例花名册（3 人 / 30 人 / 50 人）
├── scripts/          开发工具：造样例、造语音、接口联调、语法校验
└── test/             单元测试（xlsx 读写、分数解析）
```

## 安装（本地开发）

本仓库就是安装源：在工作区里执行 `plugin_manager install_bundle`，target 指向本目录；
安装后 `%DSH_PROFILE_DIR%\package.json` 会以 `link:` 指向该绝对路径，改动代码后刷新页面即可。

## 测试

```powershell
node scripts\check-syntax.cjs   # 三个源文件语法检查
node test\xlsx.test.mjs         # xlsx 读写
node test\score.test.mjs        # 分数识别
```

脚本目录 `scripts/` 里有造样例花名册（`make_samples.py`）、SAPI 造语音（`tts-asr-probe.ps1`）、重采样（`resample.py`）等开发用工具。

## 已知限制

- 一次只录一列成绩，多科目重复跑一次。
- 识别需要「说完再识别」，不是持续监听。
- 名单会发给当前会话的模型做解析（本机默认走 kedaya.ai 上的 deepseek-v4.1-flash）。

## 许可

[Apache License 2.0](LICENSE) © cyicz123
