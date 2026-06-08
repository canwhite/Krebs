-- name: math.random
-- description: 生成指定范围的随机整数
-- params: {"min": {"type": "number", "description": "最小值"}, "max": {"type": "number", "description": "最大值"}}

local p = params
return js_random(p.min, p.max)
