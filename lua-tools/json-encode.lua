-- name: json.encode
-- description: 简单的 JSON 编码（仅支持基本类型）
-- params: {"value": {"type": "any", "description": "要编码的值"}}

local p = params

local function tojson(v)
  if v == nil then
    return "null"
  elseif type(v) == "string" then
    return '"' .. v .. '"'
  elseif type(v) == "number" then
    return tostring(v)
  elseif type(v) == "boolean" then
    return tostring(v)
  elseif type(v) == "table" then
    local parts = {}
    for key, val in pairs(v) do
      table.insert(parts, tojson(key) .. ":" .. tojson(val))
    end
    return "{" .. table.concat(parts, ",") .. "}"
  else
    return '"[unknown]"'
  end
end

return tojson(p.value)
