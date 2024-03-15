import type * as DcsJs from "@foxdelta2/dcsjs";
import { useCreateErrorToast } from "@kilcekru/dcc-lib-components";
import { createSignal, ErrorBoundary, Match, Switch, useContext } from "solid-js";

import { CampaignContext } from "../../components";
import { useDataStore, useSetDataMap } from "../../components/DataProvider";
import { Scenario } from "../../data";
import styles from "./CreateCampaign.module.less";
import { CreateCampaignProvider, useCreateCampaignStore } from "./CreateCampaignContext";
import { CustomFaction, Factions, ScenarioDescription, Scenarios, Settings } from "./screens";
import { BalanceSettings } from "./screens/BalanceSettings";

export const optionalClass = (className: string, optionalClass?: string) => {
	return className + (optionalClass == null ? "" : " " + optionalClass);
};

const CreateCampaign = () => {
	const store = useCreateCampaignStore();
	const [scenario, setScenario] = createSignal("");
	const [blueFaction, setBlueFaction] = createSignal<DcsJs.Faction | undefined>(undefined);
	const [redFaction, setRedFaction] = createSignal<DcsJs.Faction | undefined>(undefined);
	const [templateFaction, setTemplateFaction] = createSignal<DcsJs.Faction | undefined>(undefined);
	const [, { activate }] = useContext(CampaignContext);
	const dataStore = useDataStore();
	const setDataMap = useSetDataMap();
	const createToast = useCreateErrorToast();

	const onActivate = (
		aiSkill: DcsJs.AiSkill,
		hardcore: boolean,
		training: boolean,
		nightMissions: boolean,
		badWeather: boolean,
	) => {
		const blue = blueFaction();
		const red = redFaction();
		if (blue == null || red == null) {
			return;
		}

		try {
			activate?.(dataStore, blue, red, aiSkill, hardcore, training, nightMissions, badWeather, scenario());
		} catch (e) {
			// eslint-disable-next-line no-console
			console.error(e);
			createToast({
				title: "Campaign not created",
				description: e instanceof Error ? e.message : "Unknown Error",
			});
		}
	};

	const customFactionPrev = () => {
		if (blueFaction() == null) {
			setCurrentScreen("Blue Faction");
		} else {
			setCurrentScreen("Red Faction");
		}
	};
	const onCustomFactionNext = (faction: DcsJs.Faction) => {
		if (blueFaction() == null) {
			setBlueFaction(faction);
			setCurrentScreen("Red Faction");
		} else {
			setRedFaction(faction);
			setCurrentScreen("Settings");
		}
	};

	const onSelectScenario = (scenario: Scenario) => {
		setScenario(scenario.name);
		setCurrentScreen("Start");
		setDataMap(scenario.map as DcsJs.MapName);
	};

	const onCustomFaction = (template?: DcsJs.Faction) => {
		if (template != null) {
			setTemplateFaction(template);
		} else {
			setTemplateFaction(undefined);
		}

		setCurrentScreen("Custom Faction");
	};
	return (
		<ErrorBoundary fallback={<div>Something went wrong during campaign creation</div>}>
			<div class={styles["create-campaign"]}>
				<div class={styles["create-campaign__content"]}>
					<Switch fallback={<div>Not Found</div>}>
						<Match when={store.currentScreen === "Scenarios"}>
							<Scenarios />
						</Match>
						<Match when={store.currentScreen === "Description"}>
							<ScenarioDescription />
						</Match>
						<Match when={store.currentScreen === "Faction" || store.currentScreen === "Enemy Faction"}>
							<Factions />
						</Match>
						<Match when={store.currentScreen === "Custom Faction"}>
							<CustomFaction prev={customFactionPrev} next={onCustomFactionNext} template={templateFaction()} />
						</Match>
						<Match when={store.currentScreen === "Settings"}>
							<Settings next={onActivate} prev={() => setCurrentScreen("Red Faction")} />
						</Match>
						<Match when={store.currentScreen === "Balance Settings"}>
							<BalanceSettings />
						</Match>
					</Switch>
				</div>
			</div>
		</ErrorBoundary>
	);
};

function CreateCampaignWithContext() {
	return (
		<CreateCampaignProvider>
			<CreateCampaign />
		</CreateCampaignProvider>
	);
}

export { CreateCampaignWithContext as CreateCampaign };
