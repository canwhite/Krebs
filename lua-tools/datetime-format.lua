-- name: datetime.format
-- description: 格式化时间字符串
-- params: {"timestamp": {"type": "number", "description": "Unix 时间戳（毫秒）"}, "timezone": {"type": "string", "description": "时区，如 'Asia/Shanghai'"}}

local p = params
return js_format_date(p.timestamp, p.timezone)
