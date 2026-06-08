-- name: file.exists
-- description: 检查文件是否存在
-- params: {"path": {"type": "string", "description": "文件路径（相对于 custom/）"}}

local p = params
return js_exists(p.path)
