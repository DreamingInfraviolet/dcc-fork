import type * as DcsJs from "@foxdelta2/dcsjs";
import { createUniqueId, useContext } from "solid-js";

import { CampaignContext } from "../../components";
import { DataContext } from "../../components/DataProvider";
import { airdromes } from "../../data";
import { useCalcNearestOppositeAirdrome, useFaction } from "../../hooks";
import { Position } from "../../types";
import {
	addHeading,
	calcPackageEndTime,
	distanceToPosition,
	findNearest,
	firstItem,
	getDurationEnRoute,
	getFlightGroups,
	getUsableAircrafts,
	getUsableAircraftsByType,
	headingToPosition,
	Minutes,
	objectToPosition,
	oppositeCoalition,
	positionFromHeading,
	random,
	randomCallSign,
} from "../../utils";
import { useTargetSelection } from "./targetSelection";

const landingNavPoint = (engressPosition: Position, airdromePosition: Position) => {
	const heading = headingToPosition(engressPosition, airdromePosition);
	return positionFromHeading(airdromePosition, addHeading(heading, 180), 25000);
};

const callSignNumber = (
	faction: DcsJs.CampaignFaction,
	base: string,
	number: number
): { flightGroup: string; unit: string } => {
	const tmp = `${base}-${number}`;

	const fgs = getFlightGroups(faction.packages);

	const callSignFg = fgs.find((fg) => fg.name === tmp);

	if (callSignFg == null) {
		return {
			flightGroup: tmp,
			unit: `${base}${number}`,
		};
	}

	return callSignNumber(faction, base, number + 1);
};

const callSign = (faction: DcsJs.CampaignFaction) => {
	const base = randomCallSign();

	return callSignNumber(faction, base, 1);
};

export const useCas = (coalition: DcsJs.CampaignCoalition) => {
	const [state] = useContext(CampaignContext);
	const faction = useFaction(coalition);
	const targetSelection = useTargetSelection(coalition);

	return () => {
		if (faction == null) {
			return;
		}

		const usableAircrafts = getUsableAircraftsByType(faction?.inventory.aircrafts, faction.cas);

		if (usableAircrafts == null || usableAircrafts.length === 0) {
			return;
		}

		const airdromeName = firstItem(faction?.airdromeNames);
		const airdrome = airdromes.find((drome) => drome.name === airdromeName);

		if (airdromeName == null || airdrome == null) {
			throw `airdrome not found: ${airdromeName ?? ""}`;
		}

		const selectedObjective = targetSelection.casTarget(airdrome.position);

		if (selectedObjective == null) {
			return;
		}

		const speed = 170;
		const headingObjectiveToAirdrome = headingToPosition(selectedObjective.position, airdrome.position);
		const racetrackStart = positionFromHeading(selectedObjective.position, headingObjectiveToAirdrome - 90, 7500);
		const racetrackEnd = positionFromHeading(selectedObjective.position, headingObjectiveToAirdrome + 90, 7500);
		const durationEnRoute = getDurationEnRoute(airdrome.position, selectedObjective.position, speed);
		const casDuration = Minutes(30);

		const startTime = Math.floor(state.timer) + Minutes(random(20, 35));
		const endEnRouteTime = startTime + durationEnRoute;
		const endCASTime = endEnRouteTime + 1 + casDuration;
		const endLandingTime = endCASTime + 1 + durationEnRoute;

		const cs = callSign(faction);

		const flightGroup: DcsJs.CampaignFlightGroup = {
			id: createUniqueId(),
			airdromeName,
			units:
				usableAircrafts?.slice(0, 2).map((aircraft, i) => ({
					aircraftId: aircraft.id,
					callSign: `${cs.unit}${i + 1}`,
					name: `${cs.flightGroup}-${i + 1}`,
					client: false,
				})) ?? [],
			name: cs.flightGroup,
			task: "CAS",
			startTime,
			tot: endEnRouteTime + 1,
			landingTime: endLandingTime,
			waypoints: [
				{
					name: "Take Off",
					position: airdrome.position,
					endPosition: racetrackStart,
					time: startTime,
					endTime: endEnRouteTime,
					speed,
					onGround: true,
				},
				{
					name: "Track-race start",
					position: racetrackStart,
					endPosition: airdrome.position,
					speed,
					duration: casDuration,
					time: endEnRouteTime + 1,
					endTime: endCASTime,
					taskStart: true,
					racetrack: {
						position: racetrackEnd,
						name: "Track-race end",
						distance: distanceToPosition(racetrackStart, racetrackEnd),
						duration: getDurationEnRoute(racetrackStart, racetrackEnd, speed),
					},
				},
				{
					name: "Landing",
					position: airdrome.position,
					endPosition: airdrome.position,
					speed,
					time: endCASTime + 1,
					endTime: endLandingTime,
					onGround: true,
				},
			],
			objective: selectedObjective,
			position: airdrome.position,
		};

		const flightGroups = [flightGroup];

		return {
			coalition,
			task: "CAS" as DcsJs.Task,
			startTime,
			endTime: calcPackageEndTime(flightGroups),
			airdrome: airdromeName,
			flightGroups,
		};
	};
};

const useCap = (coalition: DcsJs.CampaignCoalition) => {
	const [state] = useContext(CampaignContext);
	const faction = useFaction(coalition);
	const oppFaction = useFaction(oppositeCoalition(coalition));
	const calcNearestOppositeAirdrome = useCalcNearestOppositeAirdrome(coalition);
	const dataStore = useContext(DataContext);

	return (objectiveName: string) => {
		if (faction == null || oppFaction == null) {
			return;
		}

		const usableAircrafts = getUsableAircraftsByType(faction?.inventory.aircrafts, faction.cap);
		const airdromes = dataStore.airdromes;

		if (usableAircrafts == null || usableAircrafts.length === 0) {
			return;
		}

		if (airdromes == null) {
			return;
		}

		const speed = 170;

		const [objectivePosition, airdrome] =
			objectiveName === "Frontline"
				? (() => {
						const oppAirdromes = oppFaction.airdromeNames.map((name) => {
							return airdromes[name];
						});

						const nearestObjective = oppAirdromes.reduce(
							(prev, airdrome) => {
								const obj = findNearest(
									state.objectives.filter((obj) => obj.coalition === coalition),
									airdrome,
									(obj) => obj.position
								);

								if (obj == null) {
									return prev;
								}

								const distance = distanceToPosition(airdrome, obj.position);

								if (distance < prev[1]) {
									return [obj, distance] as [DcsJs.CampaignObjective, number];
								} else {
									return prev;
								}
							},
							[undefined, 1000000] as [DcsJs.CampaignObjective | undefined, number]
						)[0];

						if (nearestObjective == null) {
							return [undefined, undefined];
						} else {
							const airdromes = faction.airdromeNames.map((name) => {
								if (dataStore.airdromes == null) {
									throw "undefined airdromes";
								}
								return dataStore.airdromes?.[name];
							});

							const airdrome = findNearest(airdromes, nearestObjective.position, (ad) => ad);

							return [nearestObjective.position, airdrome];
						}
				  })()
				: [
						objectToPosition(airdromes[objectiveName as DcsJs.AirdromeName]),
						airdromes[objectiveName as DcsJs.AirdromeName],
				  ];

		if (objectiveName == null || airdrome == null || objectivePosition == null) {
			throw `airdrome not found: ${objectiveName ?? ""}`;
		}

		const oppAirdrome = calcNearestOppositeAirdrome(objectivePosition);
		const oppHeading = headingToPosition(objectivePosition, oppAirdrome);

		const heading = objectiveName === "Frontline" ? addHeading(oppHeading, 180) : oppHeading;

		const endPosition = positionFromHeading(
			objectivePosition,
			heading,
			objectiveName === "Frontline" ? 10_000 : 30_000
		);
		const durationEnRoute = getDurationEnRoute(airdrome, endPosition, speed);
		const headingObjectiveToAirdrome = headingToPosition(endPosition, oppAirdrome);
		const racetrackStart = positionFromHeading(endPosition, addHeading(headingObjectiveToAirdrome, -90), 20_000);
		const racetrackEnd = positionFromHeading(endPosition, addHeading(headingObjectiveToAirdrome, 90), 20_000);
		const duration = Minutes(60);
		const startTime = Math.floor(state.timer) + Minutes(random(20, 35));

		const endEnRouteTime = startTime + durationEnRoute;
		const endOnStationTime = endEnRouteTime + 1 + duration;
		const endLandingTime = endOnStationTime + 1 + durationEnRoute;

		const cs = callSign(faction);

		const flightGroup: DcsJs.CampaignFlightGroup = {
			id: createUniqueId(),
			airdromeName: airdrome.name,
			units:
				usableAircrafts?.slice(0, 2).map((aircraft, i) => ({
					aircraftId: aircraft.id,
					callSign: `${cs.unit}${i + 1}`,
					name: `${cs.flightGroup}-${i + 1}`,
					client: false,
				})) ?? [],
			name: cs.flightGroup,
			task: "CAP",
			startTime,
			tot: endEnRouteTime + 1,
			landingTime: endLandingTime,
			waypoints: [
				{
					name: "Take Off",
					position: objectToPosition(airdrome),
					endPosition: racetrackStart,
					time: startTime,
					endTime: endEnRouteTime,
					speed,
					onGround: true,
				},
				{
					name: "Track-race start",
					position: racetrackStart,
					endPosition: racetrackEnd,
					speed,
					duration,
					time: endEnRouteTime + 1,
					endTime: endOnStationTime,
					taskStart: true,
					racetrack: {
						position: racetrackEnd,
						name: "Track-race end",
						distance: distanceToPosition(racetrackStart, racetrackEnd),
						duration: getDurationEnRoute(racetrackStart, racetrackEnd, speed),
					},
				},
				{
					name: "Landing",
					position: objectToPosition(airdrome),
					endPosition: objectToPosition(airdrome),
					speed,
					time: endOnStationTime + 1,
					endTime: endLandingTime,
					onGround: true,
				},
			],
			position: objectToPosition(airdrome),
			objective: {
				coalition: oppositeCoalition(coalition),
				name: objectiveName,
				position: endPosition,
				structures: [],
				units: [],
			},
		};

		const flightGroups = [flightGroup];

		return {
			coalition,
			task: "CAP" as DcsJs.Task,
			startTime,
			endTime: calcPackageEndTime(flightGroups),
			airdrome: airdrome.name,
			flightGroups,
		};
	};
};

const useAwacs = (coalition: DcsJs.CampaignCoalition) => {
	const [state] = useContext(CampaignContext);
	const faction = useFaction(coalition);
	const calcNearestOppositeAirdrome = useCalcNearestOppositeAirdrome(coalition);

	return () => {
		if (faction == null) {
			return;
		}

		const usableAircrafts = getUsableAircraftsByType(faction?.inventory.aircrafts, faction?.awacs);

		if (usableAircrafts == null || usableAircrafts.length === 0) {
			return;
		}

		const speed = 170;

		const airdromeName = firstItem(faction?.airdromeNames);
		const airdrome = airdromes.find((drome) => drome.name === airdromeName);

		if (airdromeName == null || airdrome == null) {
			throw `airdrome not found: ${airdromeName ?? ""}`;
		}

		const oppAirdrome = calcNearestOppositeAirdrome(airdrome.position);
		const endPosition = positionFromHeading(
			airdrome.position,
			headingToPosition(oppAirdrome, airdrome.position),
			20000
		);
		const durationEnRoute = getDurationEnRoute(airdrome.position, endPosition, speed);
		const headingObjectiveToAirdrome = headingToPosition(endPosition, oppAirdrome);
		const racetrackStart = positionFromHeading(endPosition, addHeading(headingObjectiveToAirdrome, -90), 40_000);
		const racetrackEnd = positionFromHeading(endPosition, addHeading(headingObjectiveToAirdrome, 90), 40_000);
		const duration = Minutes(60);
		const startTime = Math.floor(state.timer) + Minutes(random(20, 35));

		const endEnRouteTime = startTime + durationEnRoute;
		const endOnStationTime = endEnRouteTime + 1 + duration;
		const endLandingTime = endOnStationTime + 1 + durationEnRoute;

		const cs = callSign(faction);

		const flightGroup: DcsJs.CampaignFlightGroup = {
			id: createUniqueId(),
			airdromeName,
			units:
				usableAircrafts?.slice(0, 1).map((aircraft, i) => ({
					aircraftId: aircraft.id,
					callSign: `${cs.unit}${i + 1}`,
					name: `${cs.flightGroup}-${i + 1}`,
					client: false,
				})) ?? [],
			name: cs.flightGroup,
			task: "AWACS",
			startTime,
			tot: endEnRouteTime + 1,
			landingTime: endLandingTime,
			waypoints: [
				{
					name: "Take Off",
					position: airdrome.position,
					endPosition: racetrackStart,
					time: startTime,
					endTime: endEnRouteTime,
					speed,
					onGround: true,
				},
				{
					name: "Track-race start",
					position: racetrackStart,
					endPosition: airdrome.position,
					speed,
					time: endEnRouteTime + 1,
					endTime: endOnStationTime,
					duration,
					taskStart: true,
					racetrack: {
						position: racetrackEnd,
						name: "Track-race end",
						distance: distanceToPosition(racetrackStart, racetrackEnd),
						duration: getDurationEnRoute(racetrackStart, racetrackEnd, speed),
					},
				},
				{
					name: "Landing",
					position: airdrome.position,
					endPosition: airdrome.position,
					speed,
					time: endOnStationTime + 1,
					endTime: endLandingTime,
					onGround: true,
				},
			],
			position: airdrome.position,
		};

		const flightGroups = [flightGroup];

		return {
			coalition,
			task: "AWACS" as DcsJs.Task,
			startTime,
			endTime: calcPackageEndTime(flightGroups),
			airdrome: airdromeName,
			flightGroups,
		};
	};
};

const useDead = (coalition: DcsJs.CampaignCoalition) => {
	const [state] = useContext(CampaignContext);
	const faction = useFaction(coalition);
	const targetSelection = useTargetSelection(coalition);

	return () => {
		if (faction == null) {
			return;
		}

		const usableAircrafts = getUsableAircraftsByType(faction?.inventory.aircrafts, faction?.dead);

		if (usableAircrafts == null || usableAircrafts.length === 0) {
			return;
		}

		const airdromeName = firstItem(faction?.airdromeNames);
		const airdrome = airdromes.find((drome) => drome.name === airdromeName);

		if (airdromeName == null || airdrome == null) {
			throw `airdrome not found: ${airdromeName ?? ""}`;
		}

		const selectedObjective = targetSelection.deadTarget(airdrome.position);

		if (selectedObjective == null) {
			return;
		}

		const speed = 170;
		const ingressPosition = positionFromHeading(
			selectedObjective.position,
			headingToPosition(selectedObjective.position, airdrome.position),
			100000
		);
		const durationEnRoute = getDurationEnRoute(airdrome.position, selectedObjective.position, speed);
		const durationIngress = getDurationEnRoute(ingressPosition, selectedObjective.position, speed);

		const startTime = Math.floor(state.timer) + Minutes(random(15, 25));
		const endEnRouteTime = startTime + durationEnRoute;
		const endIngressTime = endEnRouteTime + durationIngress;
		const endLandingTime = endEnRouteTime + 1 + durationEnRoute;

		const cs = callSign(faction);

		const flightGroup: DcsJs.CampaignFlightGroup = {
			id: createUniqueId(),
			airdromeName,
			units:
				usableAircrafts?.slice(0, 2).map((aircraft, i) => ({
					aircraftId: aircraft.id,
					callSign: `${cs.unit}${i + 1}`,
					name: `${cs.flightGroup}-${i + 1}`,
					client: false,
				})) ?? [],
			name: cs.flightGroup,
			task: "DEAD",
			startTime,
			tot: endEnRouteTime + 1,
			landingTime: endLandingTime,
			waypoints: [
				{
					name: "Take Off",
					position: airdrome.position,
					endPosition: selectedObjective.position,
					time: startTime,
					endTime: endEnRouteTime,
					speed,
					onGround: true,
				},
				{
					name: "Ingress",
					position: selectedObjective.position,
					endPosition: airdrome.position,
					speed,
					time: endEnRouteTime + 1,
					endTime: endIngressTime,
					taskStart: true,
				},
				{
					name: "DEAD",
					position: selectedObjective.position,
					endPosition: airdrome.position,
					time: endEnRouteTime + 1,
					endTime: endEnRouteTime + 1,
					speed,
				},
				{
					name: "Landing",
					position: airdrome.position,
					endPosition: airdrome.position,
					speed,
					time: endEnRouteTime + 2,
					endTime: endLandingTime,
					onGround: true,
				},
			],
			objective: {
				name: selectedObjective.id,
				coalition: oppositeCoalition(coalition),
				position: selectedObjective.position,
				structures: [],
				units: [],
			},
			position: airdrome.position,
		};

		const flightGroups = [flightGroup];

		return {
			coalition,
			task: "DEAD" as DcsJs.Task,
			startTime,
			endTime: calcPackageEndTime(flightGroups),
			airdrome: airdromeName,
			flightGroups,
		};
	};
};

export const useStrike = (coalition: DcsJs.CampaignCoalition) => {
	const [state] = useContext(CampaignContext);
	const faction = useFaction(coalition);
	const targetSelection = useTargetSelection(coalition);

	return () => {
		if (faction == null) {
			return;
		}

		const usableAircrafts = getUsableAircrafts(faction?.inventory.aircrafts, "Pinpoint Strike");

		if (usableAircrafts == null || usableAircrafts.length === 0) {
			return;
		}

		const airdromeName = firstItem(faction?.airdromeNames);
		const airdrome = airdromes.find((drome) => drome.name === airdromeName);

		if (airdromeName == null || airdrome == null) {
			throw `airdrome not found: ${airdromeName ?? ""}`;
		}

		const target = targetSelection.strikeTarget(airdrome.position);

		if (target == null) {
			return;
		}

		const speed = 170;
		const ingressPosition = positionFromHeading(
			target.position,
			headingToPosition(target.position, airdrome.position),
			15000
		);

		const oppAirdrome = targetSelection.nearestOppositeAirdrome(target.position);
		const engressHeading =
			oppAirdrome == null
				? headingToPosition(target.position, airdrome.position)
				: headingToPosition(target.position, { x: oppAirdrome.x, y: oppAirdrome.y });
		const engressPosition = positionFromHeading(target.position, addHeading(engressHeading, 180), 20000);
		const landingNavPosition = landingNavPoint(engressPosition, airdrome.position);

		const durationEnRoute = getDurationEnRoute(airdrome.position, ingressPosition, speed);
		const durationIngress = getDurationEnRoute(ingressPosition, target.position, speed);
		const durationEngress = getDurationEnRoute(target.position, engressPosition, speed);
		const durationLandingNav = getDurationEnRoute(engressPosition, airdrome.position, speed);

		const startTime = Math.floor(state.timer) + Minutes(random(30, 60));
		const endEnRouteTime = startTime + durationEnRoute;
		const endIngressTime = endEnRouteTime + durationIngress;
		const endEngressTime = endIngressTime + durationEngress;
		const endLandingNavTime = endEngressTime + durationLandingNav;
		const endLandingTime = endEnRouteTime + 1 + durationEnRoute;

		const cs = callSign(faction);

		const flightGroup: DcsJs.CampaignFlightGroup = {
			id: createUniqueId(),
			airdromeName,
			units:
				usableAircrafts?.slice(0, 2).map((aircraft, i) => ({
					aircraftId: aircraft.id,
					callSign: `${cs.unit}${i + 1}`,
					name: `${cs.flightGroup}-${i + 1}`,
					client: false,
				})) ?? [],
			name: cs.flightGroup,
			task: "Pinpoint Strike",
			startTime,
			tot: endEnRouteTime + 1,
			landingTime: endLandingTime,
			waypoints: [
				{
					name: "Take Off",
					position: airdrome.position,
					endPosition: ingressPosition,
					time: startTime,
					endTime: endEnRouteTime,
					speed,
					onGround: true,
				},
				{
					name: "Ingress",
					position: ingressPosition,
					endPosition: target.position,
					speed,
					time: endEnRouteTime + 1,
					endTime: endIngressTime,
					taskStart: true,
				},
				{
					name: "Strike",
					position: target.position,
					endPosition: engressPosition,
					speed,
					time: endIngressTime + 1,
					endTime: endIngressTime + 1,
					onGround: true,
				},
				{
					name: "Engress",
					position: engressPosition,
					endPosition: landingNavPosition,
					speed,
					time: endIngressTime + 2,
					endTime: endEngressTime,
				},
				{
					name: "Nav",
					position: landingNavPosition,
					endPosition: airdrome.position,
					speed,
					time: endEngressTime + 1,
					endTime: endLandingNavTime,
				},
				{
					name: "Landing",
					position: airdrome.position,
					endPosition: airdrome.position,
					speed,
					time: endLandingNavTime + 1,
					endTime: endLandingTime,
					onGround: true,
				},
			],
			objective: {
				coalition,
				name: target.name,
				position: target.position,
				structures: [target],
				units: [],
			},
			position: airdrome.position,
		};

		const flightGroups = [flightGroup];

		return {
			coalition,
			task: "Pinpoint Strike" as DcsJs.Task,
			startTime,
			endTime: calcPackageEndTime(flightGroups),
			airdrome: airdromeName,
			flightGroups,
		};
	};
};

export const useGeneratePackage = (coalition: DcsJs.CampaignCoalition) => {
	const awacs = useAwacs(coalition);
	const cas = useCas(coalition);
	const cap = useCap(coalition);
	const dead = useDead(coalition);
	const strike = useStrike(coalition);

	return {
		awacs,
		cas,
		cap,
		dead,
		strike,
	};
};
