-- name: file.read
-- description: 读取文件内容
-- params: {"path": {"type": "string", "description": "文件路径（相对于 custom/）"}}

local p = params
return js_read_file(p.path)
