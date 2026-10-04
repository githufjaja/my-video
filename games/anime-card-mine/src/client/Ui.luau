--!strict
-- Small UI toolkit: colors, buttons, labels, windows. Sizes are generous for phones.
local UserInputService = game:GetService("UserInputService")

local Ui = {}

Ui.isTouch = UserInputService.TouchEnabled
Ui.FONT = Enum.Font.FredokaOne
Ui.colors = {
	panel = Color3.fromRGB(34, 36, 54),
	panel2 = Color3.fromRGB(46, 49, 72),
	header = Color3.fromRGB(24, 25, 38),
	accent = Color3.fromRGB(255, 196, 60),
	good = Color3.fromRGB(70, 190, 110),
	bad = Color3.fromRGB(220, 75, 75),
	blue = Color3.fromRGB(70, 130, 235),
	text = Color3.fromRGB(255, 255, 255),
	muted = Color3.fromRGB(170, 175, 205),
	disabled = Color3.fromRGB(80, 82, 100),
}

-- Creates an instance, applies props, parents it. Returns `any` so the props table can be dynamic.
function Ui.create(className: string, props: { [string]: any }?, parent: Instance?): any
	local inst: any = Instance.new(className :: any)
	if props then
		for k, v in props do
			inst[k] = v
		end
	end
	if parent then
		inst.Parent = parent
	end
	return inst
end

function Ui.corner(parent: Instance, radius: number?): UICorner
	return Ui.create("UICorner", { CornerRadius = UDim.new(0, radius or 10) }, parent)
end

function Ui.stroke(parent: Instance, color: Color3, thickness: number?): UIStroke
	return Ui.create("UIStroke", { Color = color, Thickness = thickness or 2 }, parent)
end

function Ui.padding(parent: Instance, px: number)
	Ui.create("UIPadding", {
		PaddingLeft = UDim.new(0, px),
		PaddingRight = UDim.new(0, px),
		PaddingTop = UDim.new(0, px),
		PaddingBottom = UDim.new(0, px),
	}, parent)
end

function Ui.label(parent: Instance, props: { [string]: any }): TextLabel
	local p: { [string]: any } = {
		BackgroundTransparency = 1,
		Font = Ui.FONT,
		TextColor3 = Ui.colors.text,
		TextScaled = true,
	}
	for k, v in props do
		p[k] = v
	end
	return Ui.create("TextLabel", p, parent)
end

-- props: text, size, position, color, textColor, onClick, anchor, layoutOrder
function Ui.button(parent: Instance, props: { [string]: any }): TextButton
	local btn: TextButton = Ui.create("TextButton", {
		Text = props.text or "",
		Size = props.size or UDim2.fromOffset(120, 48),
		Position = props.position or UDim2.new(),
		AnchorPoint = props.anchor or Vector2.zero,
		LayoutOrder = props.layoutOrder or 0,
		BackgroundColor3 = props.color or Ui.colors.blue,
		TextColor3 = props.textColor or Ui.colors.text,
		Font = Ui.FONT,
		TextScaled = true,
		AutoButtonColor = true,
		BorderSizePixel = 0,
	}, parent)
	Ui.corner(btn, 10)
	Ui.create("UITextSizeConstraint", { MaxTextSize = 26, MinTextSize = 8 }, btn)
	Ui.padding(btn, 4)
	if props.onClick then
		btn.Activated:Connect(props.onClick)
	end
	return btn
end

function Ui.setEnabledLook(btn: TextButton, enabled: boolean, color: Color3)
	btn.BackgroundColor3 = if enabled then color else Ui.colors.disabled
	btn.TextTransparency = if enabled then 0 else 0.35
end

-- ===== windows =====
export type Window = {
	frame: Frame,
	body: Frame,
	open: () -> (),
	close: () -> (),
	toggle: () -> (),
	isOpen: () -> boolean,
	onOpen: (() -> ())?,
}

local current: Window? = nil

function Ui.closeAll()
	if current then
		current.close()
	end
end

function Ui.window(gui: ScreenGui, title: string): Window
	local frame: Frame = Ui.create("Frame", {
		Name = "Window_" .. title,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.41),
		Size = UDim2.fromScale(0.92, 0.78),
		Active = true, -- clicks on the window must not hit rocks behind it
		BackgroundColor3 = Ui.colors.panel,
		BorderSizePixel = 0,
		Visible = false,
		ZIndex = 10,
	}, gui)
	Ui.corner(frame, 14)
	Ui.stroke(frame, Color3.fromRGB(90, 95, 140), 2)
	Ui.create("UISizeConstraint", { MaxSize = Vector2.new(820, 520), MinSize = Vector2.new(300, 220) }, frame)

	local header: Frame = Ui.create("Frame", {
		Size = UDim2.new(1, 0, 0, 44),
		BackgroundColor3 = Ui.colors.header,
		BorderSizePixel = 0,
	}, frame)
	Ui.corner(header, 14)
	Ui.label(header, {
		Text = title,
		Position = UDim2.new(0, 14, 0, 6),
		Size = UDim2.new(1, -80, 1, -12),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.colors.accent,
	})

	local body: Frame = Ui.create("Frame", {
		Name = "Body",
		Position = UDim2.new(0, 8, 0, 50),
		Size = UDim2.new(1, -16, 1, -58),
		BackgroundTransparency = 1,
	}, frame)

	local window: Window
	window = {
		frame = frame,
		body = body,
		open = function()
			if current and current ~= window then
				current.close()
			end
			current = window
			frame.Visible = true
			if window.onOpen then
				window.onOpen()
			end
		end,
		close = function()
			frame.Visible = false
			if current == window then
				current = nil
			end
		end,
		toggle = function()
			if frame.Visible then
				window.close()
			else
				window.open()
			end
		end,
		isOpen = function()
			return frame.Visible
		end,
		onOpen = nil,
	}

	Ui.button(header, {
		text = "X",
		size = UDim2.fromOffset(44, 36),
		position = UDim2.new(1, -4, 0, 4),
		anchor = Vector2.new(1, 0),
		color = Ui.colors.bad,
		onClick = function()
			window.close()
		end,
	})
	return window
end

function Ui.scroll(parent: Instance, props: { [string]: any }): ScrollingFrame
	local p: { [string]: any } = {
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 6,
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		CanvasSize = UDim2.new(),
		ScrollingDirection = Enum.ScrollingDirection.Y,
	}
	for k, v in props do
		p[k] = v
	end
	return Ui.create("ScrollingFrame", p, parent)
end

return Ui
