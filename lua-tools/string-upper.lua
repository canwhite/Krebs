-- name: string.upper
-- description: 将字符串转为大写
-- params: {"str": {"type": "string", "description": "输入字符串"}}

local p = params
return string.upper(p.str)
