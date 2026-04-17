

local function traverseTable(obj, depth, visited)
    depth = depth or 0
    visited = visited or {}
    
    -- 避免循環引用導致死循環
    if visited[obj] then 
        OS.console.writeLine(string.rep("  ", depth) .. "[Visited] (Already scanned)")
        return 
    end
    visited[obj] = true

    local indent = string.rep("  ", depth)

    for key, value in pairs(obj) do
        local t = type(value)
        local keyStr = tostring(key)
        if t == "function" then
            -- 顯示方法
            OS.console.writeLine(string.format("%s[Method] %s: f()", indent, keyStr))
            
        -- 在 Lua 中，Table 相當於 JS 的 Object
        elseif t == "table" then
            -- 顯示節點並遞歸 (加入綠色 ANSI 轉義碼)
            OS.console.writeLine(string.format("\27[32m%s[Node] %s:\27[0m", indent, keyStr))
            traverseTable(value, depth + 1, visited)
            
        else
            -- 顯示基本數值 (string, number, boolean 等)
            OS.console.writeLine(string.format("%s[Property] %s: %s (%s)", indent, keyStr, tostring(value), t))
        end
    end
end

-- 遍歷所有全域物件
OS.console.writeLine("--- Start Traversing _G ---")
traverseTable(_G)