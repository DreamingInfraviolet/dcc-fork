import * as DcsJs from "@foxdelta2/dcsjs";
import { DataStore } from "@kilcekru/dcc-shared-rpc-types";
import { createUniqueId } from "solid-js";

import { findNearest, Minutes, oppositeCoalition, random } from "../../utils";
import { clearPackage } from "../clearPackages";
import { RunningCampaignState } from "../types";
import { getCoalitionFaction } from "../utils";
import { getPackagesWithTarget } from "./utils";

const hasStillAliveUnits = (groundGroup: DcsJs.CampaignGroundGroup, faction: DcsJs.CampaignFaction) => {
	return groundGroup.unitIds.some((unitId) => {
		const unit = faction.inventory.groundUnits[unitId];

		return unit?.alive ?? false;
	});
};

function moveFarpAircraftsToNearestFarp(
	aircrafts: Array<DcsJs.CampaignAircraft>,
	faction: DcsJs.CampaignFaction,
	sourceStructure: DcsJs.CampaignStructure,
	dataStore: DataStore
) {
	// Has the opposite faction aircrafts on the farp
	if (aircrafts.length > 0) {
		const alternativeFarps = Object.values(faction.structures).filter(
			(str) => str.structureType === "Farp" && str.id !== sourceStructure.id
		);

		if (alternativeFarps.length > 0) {
			const nearestFarp = findNearest(alternativeFarps, sourceStructure.position, (farp) => farp.position);

			if (nearestFarp != null) {
				aircrafts.forEach((ac) => {
					const inventoryAc = faction.inventory.aircrafts[ac.id];

					if (inventoryAc == null) {
						return;
					}

					inventoryAc.homeBase.type = "farp";
					inventoryAc.homeBase.name = nearestFarp.name;
				});
			}
		}

		const dataAirdromes = dataStore.airdromes;

		if (dataAirdromes == null) {
			return;
		}

		const airdromes = faction.airdromeNames.map((name) => dataAirdromes[name]);

		const nearestAirdromes = findNearest(airdromes, sourceStructure.position, (ad) => ad);

		if (nearestAirdromes != null) {
			aircrafts.forEach((ac) => {
				const inventoryAc = faction.inventory.aircrafts[ac.id];

				if (inventoryAc == null) {
					return;
				}

				inventoryAc.homeBase.type = "farp";
				inventoryAc.homeBase.name = nearestAirdromes.name;
			});
		}
	}
}
export const conquerObjective = (
	attackingGroundGroup: DcsJs.CampaignGroundGroup,
	coalition: DcsJs.CampaignCoalition,
	state: RunningCampaignState,
	dataStore: DataStore
) => {
	const faction = getCoalitionFaction(coalition, state);
	const oppFaction = getCoalitionFaction(oppositeCoalition(coalition), state);

	const objective = state.objectives[attackingGroundGroup.objective.name];

	if (objective == null) {
		// eslint-disable-next-line no-console
		throw "objective not found";
		return;
	}

	attackingGroundGroup.state = "on objective";
	attackingGroundGroup.position = objective.position;
	objective.coalition = coalition;
	objective.incomingGroundGroups["blue"] = undefined;
	objective.incomingGroundGroups["red"] = undefined;

	const oppObjectiveStructures = Object.values(oppFaction.structures).filter(
		(str) => str.objectiveName === objective.name
	);

	// Remove all packages which targets this objective
	oppObjectiveStructures.forEach((structure) => {
		const packages = getPackagesWithTarget(faction, structure.name);

		packages.forEach((pkg) => {
			clearPackage(faction, pkg);
		});
	});

	oppObjectiveStructures.forEach((structure) => {
		switch (structure.structureType) {
			case "Barrack":
			case "Depot": {
				faction.structures[structure.name] = {
					...structure,
					id: createUniqueId(),
					deploymentScore: 0,
					buildings: structure.buildings.map((building) => ({
						...building,
						alive: true,
						destroyedTime: undefined,
					})),
				};
				break;
			}
			case "Farp": {
				faction.structures[structure.name] = {
					...structure,
					id: createUniqueId(),
				};

				const farpAircrafts = Object.values(faction.inventory.aircrafts).filter((ac) => ac.homeBase.type === "farp");

				farpAircrafts.forEach((ac) => {
					const inventoryAc = faction.inventory.aircrafts[ac.id];

					if (inventoryAc == null) {
						return;
					}

					inventoryAc.homeBase.type = "farp";
					inventoryAc.homeBase.name = structure.name;
				});

				const oppFarpAircrafts = Object.values(oppFaction.inventory.aircrafts).filter(
					(ac) => ac.homeBase.name === structure.name
				);

				moveFarpAircraftsToNearestFarp(oppFarpAircrafts, oppFaction, structure, dataStore);
				break;
			}
			default: {
				faction.structures[structure.name] = {
					...structure,
					id: createUniqueId(),
				};
			}
		}
	});

	oppObjectiveStructures.forEach((structure) => {
		delete oppFaction.structures[structure.name];
	});
};

export const g2gBattle = (
	blueGroundGroup: DcsJs.CampaignGroundGroup,
	redGroundGroup: DcsJs.CampaignGroundGroup,
	state: RunningCampaignState,
	dataStore: DataStore
) => {
	if (random(1, 100) <= 50) {
		console.log(`Ground: ${blueGroundGroup.id} destroyed ground unit from group ${redGroundGroup.id}`); // eslint-disable-line no-console

		const aliveRedUnitId = redGroundGroup.unitIds.find(
			(unitId) => state.redFaction.inventory.groundUnits[unitId]?.alive === true
		);

		if (aliveRedUnitId == null) {
			throw "no alive red unit found";
		}

		const aliveRedUnit = state.redFaction.inventory.groundUnits[aliveRedUnitId];

		if (aliveRedUnit == null) {
			throw "no alive red unit found";
		}

		aliveRedUnit.alive = false;
		aliveRedUnit.destroyedTime = state.timer;
	} else {
		console.log(`Ground: ${blueGroundGroup.id} missed ground unit from group ${redGroundGroup.id}`); // eslint-disable-line no-console
	}

	if (random(1, 100) <= 50) {
		console.log(`Ground: ${redGroundGroup.id} destroyed ground unit from group ${blueGroundGroup.id}`); // eslint-disable-line no-console

		const aliveBlueUnitId = blueGroundGroup.unitIds.find(
			(unitId) => state.blueFaction.inventory.groundUnits[unitId]?.alive === true
		);

		if (aliveBlueUnitId == null) {
			throw "no alive red unit found";
		}

		const aliveBlueUnit = state.blueFaction.inventory.groundUnits[aliveBlueUnitId];

		if (aliveBlueUnit == null) {
			throw "no alive red unit found";
		}

		aliveBlueUnit.alive = false;
		aliveBlueUnit.destroyedTime = state.timer;
	} else {
		console.log(`Ground: ${redGroundGroup.id} missed ground unit from group ${blueGroundGroup.id}`); // eslint-disable-line no-console
	}

	const blueAlive = hasStillAliveUnits(blueGroundGroup, state.blueFaction);
	const redAlive = hasStillAliveUnits(redGroundGroup, state.redFaction);

	if (blueAlive && redAlive) {
		blueGroundGroup.combatTimer = state.timer + Minutes(3);
		blueGroundGroup.state = "combat";
		redGroundGroup.combatTimer = state.timer + Minutes(3);
		redGroundGroup.state = "combat";
	} else if (blueAlive) {
		conquerObjective(blueGroundGroup, "blue", state, dataStore);
	} else {
		conquerObjective(redGroundGroup, "red", state, dataStore);
	}
};

export const g2g = (
	attackingCoalition: DcsJs.CampaignCoalition,
	attackingGroundGroup: DcsJs.CampaignGroundGroup,
	state: RunningCampaignState,
	dataStore: DataStore
) => {
	const defendingCoalition = oppositeCoalition(attackingCoalition);
	const defendingFaction = getCoalitionFaction(defendingCoalition, state);

	const defendingGroundGroup = defendingFaction.groundGroups.find(
		(gg) => gg.state === "on objective" && gg.objective.name === attackingGroundGroup.objective.name
	);

	if (defendingGroundGroup == null) {
		// eslint-disable-next-line no-console
		console.error("defending ground group not found", attackingGroundGroup.objective.name);

		conquerObjective(attackingGroundGroup, attackingCoalition, state, dataStore);

		return;
	}

	const blueGroundGroup = defendingCoalition === "blue" ? defendingGroundGroup : attackingGroundGroup;
	const redGroundGroup = defendingCoalition === "red" ? defendingGroundGroup : attackingGroundGroup;

	g2gBattle(blueGroundGroup, redGroundGroup, state, dataStore);
};
