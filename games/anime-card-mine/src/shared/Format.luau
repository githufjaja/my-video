--!strict
-- Number formatting: 1500 -> 1.5K
local Format = {}

local SUFFIX = { "", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc" }

local function trim(s: string): string
	local out = s:gsub("%.?0+$", "")
	return out
end

function Format.number(n: number): string
	if n ~= n then
		return "0"
	end
	if n == math.huge then
		return "MAX"
	end
	n = math.floor(n)
	if n < 1000 then
		return tostring(n)
	end
	local idx = 0
	local v = n
	while v >= 1000 and idx < #SUFFIX - 1 do
		v /= 1000
		idx += 1
	end
	return trim(string.format("%.2f", v)) .. SUFFIX[idx + 1]
end

function Format.money(n: number): string
	return "$" .. Format.number(n)
end

-- 83 -> "1m 23s", 3725 -> "1h 2m"
function Format.time(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	if seconds >= 3600 then
		return string.format("%dh %dm", seconds // 3600, (seconds % 3600) // 60)
	end
	return string.format("%dm %02ds", seconds // 60, seconds % 60)
end

function Format.percent(p: number): string
	if p <= 0 then
		return "0%"
	end
	if p < 1 then
		return trim(string.format("%.2f", p)) .. "%"
	end
	return trim(string.format("%.1f", p)) .. "%"
end

return Format
