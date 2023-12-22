import type * as DcsJs from "@foxdelta2/dcsjs";
import type * as Types from "@kilcekru/dcc-shared-types";
import * as Utils from "@kilcekru/dcc-shared-utils";

import { Events } from "../../../utils";
import { generateCallSign } from "../../utils";
import { type QueryKey, world } from "../../world";
import type { Aircraft } from "../Aircraft";
import { EntityId } from "../Entity";
import { Flightplan } from "../Flightplan";
import { Group, GroupProps } from "../Group";
import type { HomeBase } from "../HomeBase";
import { type Package } from "../Package";
import { WaypointTemplate } from "../Waypoint";

export interface FlightGroupProps extends GroupProps {
	task: DcsJs.Task;
	package: Package;
	aircrafts: Set<Aircraft>;
	homeBase: HomeBase;
	taskWaypoints: Array<WaypointTemplate>;
}

export type A2ACombat = {
	type: "a2a";
	target: FlightGroup;
	cooldownTime: number;
};

export class FlightGroup<EventNames extends keyof Events.EventMap.All = never> extends Group<
	EventNames | keyof Events.EventMap.FlightGroup
> {
	#aircrafts: Set<Aircraft> = new Set();
	public readonly task: DcsJs.Task;
	public readonly flightplan: Flightplan = new Flightplan(this);
	public readonly startTime: number;
	public readonly name: string;
	public readonly homeBase: HomeBase;
	public combat: A2ACombat | undefined;
	#packageId: EntityId;

	get aircrafts() {
		return this.#aircrafts;
	}

	get package() {
		return world.getEntity<Package>(this.#packageId);
	}

	get isInCombat(): boolean {
		return this.combat != null;
	}

	get a2aRange(): number {
		let maxRange = 0;

		for (const aircraft of this.#aircrafts) {
			const range = aircraft.a2aRange;

			if (range > maxRange) {
				maxRange = range;
			}
		}

		return maxRange;
	}

	protected constructor(args: FlightGroupProps) {
		super({ ...args, queries: new Set([`flightGroups-${args.task}` as QueryKey]) });

		const cs = generateCallSign(args.coalition, "aircraft");
		this.task = args.task;
		this.#packageId = args.package.id;
		this.startTime = Utils.DateTime.toFullMinutes(world.time + Utils.DateTime.Minutes(Utils.Random.number(15, 25)));
		this.name = cs.flightGroupName;
		this.#aircrafts = args.aircrafts;
		this.homeBase = args.homeBase;

		for (const aircraft of this.#aircrafts) {
			aircraft.addToFlightGroup(this);
		}

		if (this.coalition === "blue") {
			world.flightGroupsUpdate();
		}
	}

	takeOff() {
		this.addToQuery("mapEntities");
	}

	land() {
		this.destructor();
	}

	move(worldDelta: number) {
		if (this.isInCombat && this.combat != null) {
			const distance = Utils.Location.distanceToPosition(this.position, this.combat.target.position);

			let speed = 300;
			let heading = Utils.Location.headingToPosition(this.position, this.combat.target.position);

			if (distance < 2_000) {
				speed = 150;

				heading = Utils.Location.addHeading(heading, 90);
			}

			const distanceTraveled = Math.round(Utils.DateTime.toSeconds(worldDelta) * speed);
			this.position = Utils.Location.positionFromHeading(this.position, heading, distanceTraveled);
		} else {
			const target = this.flightplan.currentWaypoint;

			if (target == null) {
				// eslint-disable-next-line no-console
				console.warn("no target found for flight group", this);
				return;
			}

			if (target.isRacetrack && target.isActive) {
				if (target.racetrack == null || target.duration == null) {
					throw new Error("no racetrack found for waypoint");
				}

				// Calculate the distance between the racetrack points
				const racetrackDistance = Utils.Location.distanceToPosition(target.position, target.racetrack.position);
				const distancesAlreadyFlown =
					Utils.DateTime.toSeconds(world.time - target.arrivalTime) * this.package.cruiseSpeed;

				const racetrackRounds = Math.floor(distancesAlreadyFlown / racetrackDistance);

				// If the racetrack rounds are even, the flight group is heading to the racetrack start
				const raceTrackHeading =
					racetrackRounds % 2 === 0
						? Utils.Location.headingToPosition(target.position, target.racetrack.position)
						: Utils.Location.headingToPosition(target.racetrack.position, target.position);
				const distanceTraveled = Math.round(Utils.DateTime.toSeconds(worldDelta) * this.package.cruiseSpeed);
				this.position = Utils.Location.positionFromHeading(this.position, raceTrackHeading, distanceTraveled);
			} else {
				const heading = Utils.Location.headingToPosition(this.position, target.position);
				const distance = Utils.Location.distanceToPosition(this.position, target.position);

				// How long in seconds till the flight group arrives at the waypoint
				const timeTillArrival = this.flightplan.arrivalTime - world.time;
				// Calculate the speed in meters per second to reach the waypoint in time
				const speed = distance / Utils.DateTime.toSeconds(timeTillArrival);
				// Calculate the distance traveled in meters in the tick
				const distanceTraveled = Math.round(Utils.DateTime.toSeconds(worldDelta) * speed);
				// Calculate the new position
				this.position = Utils.Location.positionFromHeading(this.position, heading, distanceTraveled);
			}
		}
	}

	engageA2A(enemy: FlightGroup) {
		this.combat = {
			type: "a2a",
			target: enemy,
			cooldownTime: world.time,
		};
	}

	fireA2A(distance: number) {
		if (this.combat == null) {
			throw new Error("combat is null");
		}

		aircraftLoop: for (const aircraft of this.#aircrafts) {
			const a2aWeapons = aircraft.a2aWeapons;

			for (const weapon of a2aWeapons.values()) {
				if (weapon.count > 0) {
					if (distance < weapon.item.range * Utils.Config.combat.a2a.rangeMultiplier) {
						weapon.count -= 1;

						// Does the missile hit?
						const distanceFactor = 1 - distance / weapon.item.range;

						if (Utils.Random.number(1, 100) <= 100 * distanceFactor) {
							// eslint-disable-next-line no-console
							console.log("fire", weapon.item.name, "at", this.combat.target.name, "from", this.name);

							this.combat.cooldownTime = world.time + Utils.Config.combat.a2a.cooldownDuration;

							const flightGroupDestroyed = this.combat.target.destroyAircraft();

							if (flightGroupDestroyed) {
								this.combat = undefined;
							}

							break aircraftLoop;
						} else {
							// eslint-disable-next-line no-console
							console.log("miss", weapon.item.name, "at", this.combat.target.name, "from", this.name);
						}
					}
				}
			}
		}
	}

	/**
	 * Destroy an aircraft in the flight group
	 *
	 * @returns true if the all aircraft within the flight group was destroyed
	 */
	destroyAircraft() {
		const [aircraft] = this.#aircrafts;

		if (aircraft == null) {
			throw new Error("aircraft is null");
		}

		this.#aircrafts.delete(aircraft);
		aircraft.destructor();

		if (this.#aircrafts.size === 0) {
			this.destructor();

			return true;
		} else {
			return false;
		}
	}

	override destructor(): void {
		// eslint-disable-next-line no-console
		console.log("destructor flight group", this.name);
		super.destructor();
		this.package.removeFlightGroup(this);
	}

	toMapJSON(): Types.Campaign.MapItem {
		return {
			name: this.name,
			position: this.position,
			type: "flightGroup",
			coalition: this.coalition,
			task: this.task,
		};
	}

	override toJSON(): Types.Campaign.FlightGroupItem {
		return {
			startTime: this.startTime,
			name: this.name,
			task: this.task,
			coalition: this.coalition,
			id: this.id,
			aircrafts: Array.from(this.#aircrafts).map((aircraft) => aircraft.toJSON()),
			flightplan: this.flightplan.toJSON(),
		};
	}
}
