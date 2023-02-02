import * as Components from "@kilcekru/dcc-lib-components";
import { useContext } from "solid-js";

import { CampaignContext } from "../../../../components/CampaignProvider";
import { Clock } from "../../../../components/Clock";
import styles from "./TimerClock.module.less";

export const TimerClock = () => {
	const [state, { setMultiplier, togglePause, resume }] = useContext(CampaignContext);

	const onPressMultiplier = (multiplier: number) => {
		setMultiplier?.(multiplier);
		resume?.();
	};

	return (
		<div>
			<Clock value={state.timer} />

			<Components.Button onPress={() => togglePause?.()} unstyled class={styles.icon}>
				{state.paused ? <Components.Icons.Play /> : <Components.Icons.Pause />}
			</Components.Button>
			<Components.Button onPress={() => onPressMultiplier(1)}>1</Components.Button>
			<Components.Button onPress={() => onPressMultiplier(60)}>60</Components.Button>
			<Components.Button onPress={() => onPressMultiplier(600)}>600</Components.Button>
		</div>
	);
};
