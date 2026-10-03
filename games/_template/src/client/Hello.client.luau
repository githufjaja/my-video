-- Підказка гравцю при вході (клієнтський скрипт)
local StarterGui = game:GetService("StarterGui")

task.wait(2)
pcall(function()
	StarterGui:SetCore("SendNotification", {
		Title = "Збирай монетки!",
		Text = "Жовті монети дають очки — рахунок справа вгорі.",
		Duration = 6,
	})
end)
