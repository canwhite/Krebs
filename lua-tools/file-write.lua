-- name: file.write
-- description: 写入内容到文件（限制在 custom/ 目录）
-- params: {"path": {"type": "string", "description": "文件路径（相对于 custom/）"}, "content": {"type": "string", "description": "文件内容"}}

local p = params
return js_write_file(p.path, p.content)
