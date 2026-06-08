-- name: string.lower
-- description: 将字符串转为小写
-- params: {"str": {"type": "string", "description": "输入字符串"}}

local p = params
return string.lower(p.str)
