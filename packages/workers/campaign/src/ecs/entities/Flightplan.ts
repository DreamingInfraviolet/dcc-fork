import type * as Types from "@kilcekru/dcc-shared-types";
import * as Utils from "@kilcekru/dcc-shared-utils";

import { world } from "../world";
import type { FlightGroup } from "./FlightGroup";
import { Waypoint, WaypointTemplate } from "./Waypoint";

export class Flightplan extends Array {
	#flightGroup: FlightGroup;
	#list: Array<Waypoint> = [];

	constructor(flightGroup: FlightGroup) {
		super();
		this.#flightGroup = flightGroup;
	}

	get prevWaypoint() {
		return Utils.Array.lastItem(this.#list);
	}

	get currentWaypoint() {
		let waypoint: Waypoint | undefined;
		let flightPlanTime = this.startTime;

		if (world.time < this.#flightGroup.startTime) {
			return;
		}

		for (const wp of this.#list) {
			flightPlanTime += wp.arrivalDuration + (wp.duration ?? 0);

			if (flightPlanTime > world.time) {
				waypoint = wp;
				break;
			}
		}

		return waypoint;
	}

	get timeTable() {
		const timeTable: Array<{
			start: string;
			end?: string;
			name: string;
		}> = [];
		let arrivalTime = this.startTime;

		for (const wp of this.#list) {
			arrivalTime += wp.arrivalDuration;

			timeTable.push({
				start: Utils.DateTime.timerToDate(arrivalTime).toISOString(),
				end: wp.duration == null ? undefined : Utils.DateTime.timerToDate(arrivalTime + wp.duration).toISOString(),
				name: wp.name,
			});

			arrivalTime += wp.duration ?? 0;
		}

		return timeTable;
	}

	get arrivalTime() {
		let arrivalTime = this.startTime;

		for (const wp of this.#list) {
			arrivalTime += wp.arrivalDuration;

			if (arrivalTime > world.time) {
				break;
			}

			arrivalTime += wp.duration ?? 0;
		}

		return arrivalTime;
	}

	get startTime() {
		return this.#flightGroup.startTime;
	}

	get waypoints() {
		return this.#list;
	}

	#addSingle(waypoint: WaypointTemplate) {
		const prev = this.prevWaypoint;
		if (prev == null) {
			this.#list.push(new Waypoint({ ...waypoint, arrivalDuration: 0, flightplan: this }));
			return;
		}

		const distance = Utils.Location.distanceToPosition(prev.position, waypoint.position);
		const speed = this.#flightGroup.package.cruiseSpeed;

		const arrivalDuration = Utils.DateTime.Seconds(Math.round(distance / speed));

		this.#list.push(new Waypoint({ ...waypoint, arrivalDuration, flightplan: this }));
	}

	add(...waypoints: Array<WaypointTemplate>) {
		for (const wp of waypoints) {
			this.#addSingle(wp);
		}
	}

	toJSON(): Types.Campaign.FlightplanItem {
		return this.#list.map((wp) => wp.toJSON());
	}
}
