--!strict
-- Card visual: colored frame by grade + placeholder icon + name + income.
-- Everything is scale-based, so the same card works in a menu and in a BillboardGui over a pedestal.
local Cards = require(script.Parent.Cards)
local Grades = require(script.Parent.Grades)
local Format = require(script.Parent.Format)

local CardView = {}

local FONT = Enum.Font.FredokaOne

local function label(parent: Instance, name: string, text: string, pos: UDim2, size: UDim2, color: Color3): TextLabel
	local l = Instance.new("TextLabel")
	l.Name = name
	l.BackgroundTransparency = 1
	l.Position = pos
	l.Size = size
	l.Font = FONT
	l.Text = text
	l.TextColor3 = color
	l.TextScaled = true
	l.Parent = parent
	return l
end

-- opts.count: shows a "x3" badge; opts.hideIncome: no income line
function CardView.create(cardId: string, opts: { count: number?, hideIncome: boolean? }?): Frame
	local def = Cards.byId[cardId]
	local grade = Grades.info[def.grade]

	local root = Instance.new("Frame")
	root.Name = "Card_" .. cardId
	root.Size = UDim2.fromScale(1, 1)
	root.BackgroundColor3 = grade.back
	root.BorderSizePixel = 0

	local ratio = Instance.new("UIAspectRatioConstraint")
	ratio.AspectRatio = 0.74
	ratio.Parent = root

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0.09, 0)
	corner.Parent = root

	local stroke = Instance.new("UIStroke")
	stroke.Color = grade.color
	stroke.Thickness = 3
	stroke.Parent = root

	-- grade strip
	local strip = label(root, "Grade", string.upper(def.grade), UDim2.fromScale(0.08, 0.03), UDim2.fromScale(0.84, 0.11), grade.color)

	-- placeholder icon (circle with initials)
	local icon = Instance.new("Frame")
	icon.Name = "Icon"
	icon.AnchorPoint = Vector2.new(0.5, 0)
	icon.Position = UDim2.fromScale(0.5, 0.16)
	icon.Size = UDim2.fromScale(0.62, 0.62 * 0.74)
	icon.BackgroundColor3 = def.color
	icon.BorderSizePixel = 0
	icon.Parent = root
	local iconAspect = Instance.new("UIAspectRatioConstraint")
	iconAspect.AspectRatio = 1
	iconAspect.Parent = icon
	local iconCorner = Instance.new("UICorner")
	iconCorner.CornerRadius = UDim.new(1, 0)
	iconCorner.Parent = icon
	local iconStroke = Instance.new("UIStroke")
	iconStroke.Color = grade.color
	iconStroke.Thickness = 2
	iconStroke.Parent = icon
	label(icon, "Initials", Cards.initials(def), UDim2.fromScale(0.15, 0.2), UDim2.fromScale(0.7, 0.6), Color3.fromRGB(30, 30, 40))

	local nameLabel = label(root, "Name", def.name, UDim2.fromScale(0.05, 0.62), UDim2.fromScale(0.9, 0.2), Color3.fromRGB(255, 255, 255))
	nameLabel.TextWrapped = true

	if not (opts and opts.hideIncome) then
		label(root, "Income", "+" .. Format.number(def.income) .. "/s", UDim2.fromScale(0.1, 0.83), UDim2.fromScale(0.8, 0.12), Color3.fromRGB(120, 255, 150))
	end

	if opts and opts.count and opts.count > 1 then
		local badge = label(root, "Count", "x" .. tostring(opts.count), UDim2.fromScale(0.62, 0.0), UDim2.fromScale(0.36, 0.14), Color3.fromRGB(255, 255, 255))
		badge.ZIndex = 3
		strip.TextXAlignment = Enum.TextXAlignment.Left
	end

	return root
end

return CardView
