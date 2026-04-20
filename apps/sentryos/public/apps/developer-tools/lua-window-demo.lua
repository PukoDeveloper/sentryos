-- ── SentryOS Lua Window Demo ──────────────────────────────
-- 用 Lua 撰寫的互動式視窗應用範例，展示 Lua Runtime 的完整能力。

-- ── 狀態 ──────────────────────────────────────────────────
local counter = 0
local history = {}       -- 操作紀錄
local maxHistory = 8
local theme = "dark"     -- dark | light

-- ── 色彩 ──────────────────────────────────────────────────
local C = {
    dark = {
        bg       = "linear-gradient(180deg, rgba(8,12,20,0.97), rgba(4,8,14,0.95))",
        text     = "#d8e8ff",
        dim      = "rgba(216,232,255,0.45)",
        accent   = "#4a90d9",
        card     = "rgba(255,255,255,0.03)",
        border   = "rgba(74,144,217,0.18)",
        btnBg    = "rgba(74,144,217,0.15)",
        btnHover = "#4a90d9",
        danger   = "#ff6b6b",
        success  = "#6be68a",
        warn     = "#f5c542",
    },
    light = {
        bg       = "linear-gradient(180deg, #f0f4f8, #e2e8f0)",
        text     = "#1a202c",
        dim      = "rgba(26,32,44,0.5)",
        accent   = "#3182ce",
        card     = "rgba(0,0,0,0.03)",
        border   = "rgba(49,130,206,0.2)",
        btnBg    = "rgba(49,130,206,0.12)",
        btnHover = "#3182ce",
        danger   = "#e53e3e",
        success  = "#38a169",
        warn     = "#d69e2e",
    },
}

local function c()
    return C[theme]
end

-- ── 視窗建立 ──────────────────────────────────────────────
local win = OS.ui.createWindow({
    title   = "🌙 Lua Window Demo",
    width   = 520,
    height  = 480,
    useDefaultFrame = true,
    resizable = true,
    style = {
        background = c().bg,
        color      = c().text,
        border     = "1px solid " .. c().border,
        boxShadow  = "0 24px 60px rgba(0,0,0,0.35)",
    },
})
local windowId = win.data

-- ── 工具函式 ──────────────────────────────────────────────
local function pushHistory(action)
    table.insert(history, 1, action)
    if #history > maxHistory then
        table.remove(history, #history)
    end
end

local function fmtCounter()
    if counter >= 0 then
        return "+" .. tostring(counter)
    end
    return tostring(counter)
end

local function counterColor()
    if counter > 0 then return c().success end
    if counter < 0 then return c().danger end
    return c().dim
end

-- ── UI 建構 ───────────────────────────────────────────────
local function buildHistoryItems()
    local items = {}
    if #history == 0 then
        items[#items + 1] = OS.ui.label("尚無操作紀錄", {
            fontSize = "12px", color = c().dim, fontStyle = "italic",
            textAlign = "center", padding = "12px 0",
        })
    else
        for i, entry in ipairs(history) do
            items[#items + 1] = OS.ui.label(entry, {
                fontSize = "12px",
                color = c().dim,
                padding = "3px 0",
                borderBottom = "1px solid rgba(255,255,255,0.04)",
            }, "hist-" .. tostring(i))
        end
    end
    return items
end

local function btnStyle(bg)
    return {
        padding      = "8px 18px",
        borderRadius = "8px",
        background   = bg or c().btnBg,
        color        = c().text,
        border       = "1px solid " .. c().border,
        cursor       = "pointer",
        fontWeight   = "600",
        fontSize     = "14px",
        textAlign    = "center",
        minWidth     = "70px",
    }
end

local function buildUI()
    return OS.ui.stack({
        OS.ui.stack({
            -- 標題區
            OS.ui.stack({
                OS.ui.label("Lua Runtime Demo", {
                    fontSize = "20px", fontWeight = "bold", color = c().accent,
                }),
                OS.ui.label("由 Lua 5.4 驅動的互動式視窗應用", {
                    fontSize = "12px", color = c().dim,
                }),
            }, { flexDirection = "column", gap = "2px" }),

            -- 主題切換
            OS.ui.button(theme == "dark" and "☀️ Light" or "🌙 Dark", {
                padding = "6px 14px", borderRadius = "6px",
                background = c().btnBg, color = c().text,
                border = "1px solid " .. c().border,
                cursor = "pointer", fontSize = "12px",
            }, "btn-theme"),
        }, {
            flexDirection = "row", justifyContent = "space-between",
            alignItems = "flex-start", padding = "0 0 12px 0",
            borderBottom = "1px solid " .. c().border,
        }),

        -- 計數器顯示區
        OS.ui.stack({
            OS.ui.label("COUNTER", {
                fontSize = "11px", color = c().dim,
                letterSpacing = "2px", fontWeight = "600",
            }),
            OS.ui.label(fmtCounter(), {
                fontSize = "48px", fontWeight = "bold",
                color = counterColor(),
                fontFamily = "'Cascadia Code', 'Fira Code', monospace",
                textAlign = "center",
            }, "counter-display"),
            -- 進度條
            OS.ui.panel({
                OS.ui.panel({}, {
                    width = tostring(math.min(math.abs(counter), 100)) .. "%",
                    height = "100%",
                    background = counterColor(),
                    borderRadius = "3px",
                    transition = "width 300ms ease, background 300ms ease",
                }, "bar-fill"),
            }, {
                height = "6px", background = "rgba(255,255,255,0.06)",
                borderRadius = "3px", overflow = "hidden",
            }),
        }, {
            flexDirection = "column", alignItems = "center", gap = "8px",
            padding = "20px", borderRadius = "12px",
            background = c().card, border = "1px solid " .. c().border,
        }),

        -- 操作按鈕列
        OS.ui.stack({
            OS.ui.button("-10", btnStyle("rgba(255,107,107,0.15)"), "btn-sub10"),
            OS.ui.button("-1",  btnStyle("rgba(255,107,107,0.10)"), "btn-sub1"),
            OS.ui.button("Reset", btnStyle("rgba(255,255,255,0.06)"), "btn-reset"),
            OS.ui.button("+1",  btnStyle("rgba(107,230,138,0.10)"), "btn-add1"),
            OS.ui.button("+10", btnStyle("rgba(107,230,138,0.15)"), "btn-add10"),
        }, {
            flexDirection = "row", justifyContent = "center",
            gap = "8px", flexWrap = "wrap",
        }),

        -- 快捷操作
        OS.ui.stack({
            OS.ui.button("×2 倍增", btnStyle(c().btnBg), "btn-double"),
            OS.ui.button("÷2 減半", btnStyle(c().btnBg), "btn-half"),
            OS.ui.button("±  反轉", btnStyle(c().btnBg), "btn-negate"),
            OS.ui.button("🎲 隨機", btnStyle(c().btnBg), "btn-random"),
        }, {
            flexDirection = "row", justifyContent = "center",
            gap = "8px", flexWrap = "wrap",
        }),

        -- 操作紀錄
        OS.ui.stack({
            OS.ui.label("📋 操作紀錄", {
                fontSize = "13px", fontWeight = "bold", color = c().accent,
                marginBottom = "4px",
            }),
            OS.ui.stack(buildHistoryItems(), {
                flexDirection = "column", gap = "2px",
                maxHeight = "120px", overflow = "auto",
            }, "history-list"),
        }, {
            flexDirection = "column", padding = "12px",
            borderRadius = "10px", background = c().card,
            border = "1px solid " .. c().border,
        }),

        -- 底部狀態列
        OS.ui.stack({
            OS.ui.label(
                string.format("PID: %d  |  Engine: Lua 5.4  |  操作次數: %d", OS.pid, #history),
                { fontSize = "11px", color = c().dim }
            , "status-bar"),
        }, {
            padding = "8px 0 0 0",
            borderTop = "1px solid " .. c().border,
            marginTop = "auto",
        }),
    }, {
        flexDirection = "column", gap = "14px",
        padding = "18px", height = "100%",
    })
end

-- ── 初始化 ────────────────────────────────────────────────
OS.ui.initialize(windowId, { buildUI() })

-- ── 更新 UI ──────────────────────────────────────────────
local function refresh()
    OS.ui.update(windowId, "counter-display", {
        text  = fmtCounter(),
        style = { color = counterColor() },
    })
    OS.ui.update(windowId, "bar-fill", {
        style = {
            width = tostring(math.min(math.abs(counter), 100)) .. "%",
            background = counterColor(),
        },
    })
    OS.ui.update(windowId, "status-bar", {
        text = string.format("PID: %d  |  Engine: Lua 5.4  |  操作次數: %d", OS.pid, #history),
    })
    -- 重建歷史列表
    OS.ui.update(windowId, "history-list", {
        children = buildHistoryItems(),
    })
end

local function applyOp(label, fn)
    local old = counter
    fn()
    pushHistory(string.format("%s : %d → %d", label, old, counter))
    refresh()
end

-- ── 事件處理 ──────────────────────────────────────────────
function onWindowEvent(event)
    local id = event.controlId

    if id == "btn-add1" then
        applyOp("+1", function() counter = counter + 1 end)

    elseif id == "btn-sub1" then
        applyOp("-1", function() counter = counter - 1 end)

    elseif id == "btn-add10" then
        applyOp("+10", function() counter = counter + 10 end)

    elseif id == "btn-sub10" then
        applyOp("-10", function() counter = counter - 10 end)

    elseif id == "btn-reset" then
        applyOp("Reset", function() counter = 0 end)

    elseif id == "btn-double" then
        applyOp("×2", function() counter = counter * 2 end)

    elseif id == "btn-half" then
        applyOp("÷2", function() counter = math.floor(counter / 2) end)

    elseif id == "btn-negate" then
        applyOp("±", function() counter = -counter end)

    elseif id == "btn-random" then
        applyOp("🎲", function() counter = math.random(-99, 99) end)

    elseif id == "btn-theme" then
        if theme == "dark" then theme = "light" else theme = "dark" end
        pushHistory("Theme → " .. theme)
        -- 更新視窗框架色彩
        OS.ui.setWindowStyle(windowId, {
            background = c().bg,
            color      = c().text,
            border     = "1px solid " .. c().border,
        })
        -- 全畫面重繪（保留捲動位置）
        OS.ui.initialize(windowId, { buildUI() }, { preserveScroll = true })
    end
end
