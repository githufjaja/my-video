--!strict
-- Client copy of the player's state (sent by the server). The client never changes it by itself.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Types = require(ReplicatedStorage.Shared.Types)

local State = {}

State.data = nil :: Types.Snapshot?
State.selectedCard = nil :: string? -- card chosen in the Cards window
State.changed = Instance.new("BindableEvent")
State.selectionChanged = Instance.new("BindableEvent")

function State.init()
	Remotes.get("State").OnClientEvent:Connect(function(snapshot: Types.Snapshot)
		State.data = snapshot
		State.changed:Fire()
	end)
	Remotes.get("RequestState"):FireServer()
	-- if the first snapshot is lost (very slow load), ask again
	task.spawn(function()
		for _ = 1, 10 do
			task.wait(3)
			if State.data then
				return
			end
			Remotes.get("RequestState"):FireServer()
		end
	end)
end

function State.select(cardId: string?)
	State.selectedCard = cardId
	State.selectionChanged:Fire()
end

function State.onChanged(fn: () -> ()): RBXScriptConnection
	return State.changed.Event:Connect(fn)
end

function State.onSelection(fn: () -> ()): RBXScriptConnection
	return State.selectionChanged.Event:Connect(fn)
end

return State
