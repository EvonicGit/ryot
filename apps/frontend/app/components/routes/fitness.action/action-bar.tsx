import {
	ActionIcon,
	Box,
	Button,
	Container,
	Group,
	Paper,
	Stack,
	Text,
} from "@mantine/core";
import {
	ExerciseLot,
	UserUnitSystem,
	type WorkoutSetStatistic,
} from "@ryot/generated/graphql/backend/graphql";
import { isString } from "@ryot/ts-utils";
import {
	IconCheck,
	IconHistory,
	IconMinus,
	IconPlus,
} from "@tabler/icons-react";
import { produce } from "immer";
import { displayWeightWithUnit } from "~/components/fitness/utils";
import { useExerciseDetails } from "~/lib/shared/hooks";
import {
	useCurrentWorkout,
	useCurrentWorkoutTimerAtom,
} from "~/lib/state/fitness";
import { getActiveSet } from "./hooks";
import { RestTimer } from "./rest-timer";
import {
	isSetConfirmationDisabled,
	usePreviousSetData,
	useSetConfirmationHandler,
} from "./set-display/functions";
import type { FuncStartTimer } from "./types";

/** Height reserved under the workout so the fixed bar never covers content. */
export const ACTION_BAR_SPACER_HEIGHT = 230;

type SteppableStat = "weight" | "reps";

const Stepper = (props: {
	label: string;
	value?: string | null;
	onStep: (direction: 1 | -1) => void;
}) => (
	<Stack gap={2} align="center" style={{ flex: 1 }}>
		<Group gap="xs" wrap="nowrap" justify="center">
			<ActionIcon
				size={52}
				radius="xl"
				variant="light"
				aria-label={`Decrease ${props.label}`}
				onClick={() => props.onStep(-1)}
			>
				<IconMinus size={26} />
			</ActionIcon>
			<Text fz={26} fw={700} miw={64} ta="center">
				{isString(props.value) && props.value !== "" ? props.value : "–"}
			</Text>
			<ActionIcon
				size={52}
				radius="xl"
				variant="light"
				aria-label={`Increase ${props.label}`}
				onClick={() => props.onStep(1)}
			>
				<IconPlus size={26} />
			</ActionIcon>
		</Group>
		<Text size="xs" c="dimmed">
			{props.label}
		</Text>
	</Stack>
);

const ActiveSetControls = (props: {
	setIdx: number;
	exerciseIdx: number;
	stopTimer: () => void;
	isWorkoutPaused: boolean;
	playCheckSound: () => void;
	startTimer: FuncStartTimer;
}) => {
	const [currentWorkout, setCurrentWorkout] = useCurrentWorkout();
	const exercise = currentWorkout?.exercises[props.exerciseIdx];
	const set = exercise?.sets[props.setIdx];
	const { data: exerciseDetails } = useExerciseDetails(exercise?.exerciseId);
	const { data: previousSetData } = usePreviousSetData({
		setIdx: props.setIdx,
		exerciseIdx: props.exerciseIdx,
		exerciseId: exercise?.exerciseId || "",
		currentWorkout: currentWorkout as NonNullable<typeof currentWorkout>,
	});
	const confirmSet = useSetConfirmationHandler({
		setIdx: props.setIdx,
		stopTimer: props.stopTimer,
		startTimer: props.startTimer,
		exerciseIdx: props.exerciseIdx,
		playCheckSound: props.playCheckSound,
		isWorkoutPaused: props.isWorkoutPaused,
	});

	if (!currentWorkout || !exercise || !set) return null;

	const isMetric = exercise.unitSystem === UserUnitSystem.Metric;
	const showWeight = exercise.lot === ExerciseLot.RepsAndWeight;
	const showReps = [
		ExerciseLot.Reps,
		ExerciseLot.RepsAndWeight,
		ExerciseLot.RepsAndDuration,
		ExerciseLot.RepsAndDurationAndDistance,
	].includes(exercise.lot);
	const stepSize: Record<SteppableStat, number> = {
		reps: 1,
		weight: isMetric ? 1 : 2.5,
	};

	// What an empty field starts from: this workout's previous set, else last session.
	const baseValue = (stat: SteppableStat) => {
		const earlier = exercise.sets
			.slice(0, props.setIdx)
			.map((s) => s.statistic[stat])
			.filter((v) => isString(v) && v !== "")
			.at(-1);
		return Number(earlier ?? previousSetData?.[stat] ?? 0);
	};

	const stepStat = (stat: SteppableStat, direction: 1 | -1) => {
		setCurrentWorkout(
			produce(currentWorkout, (draft) => {
				const draftSet = draft.exercises[props.exerciseIdx].sets[props.setIdx];
				const raw = draftSet.statistic[stat];
				let next: number;
				if (!isString(raw) || raw === "") {
					const base = baseValue(stat);
					next = base > 0 ? base : direction > 0 ? stepSize[stat] : 0;
				} else {
					next = Number(raw) + direction * stepSize[stat];
				}
				next = Math.max(0, Math.round(next * 100) / 100);
				draftSet.statistic[stat] = next.toString();
			}),
		);
	};

	const copyLastTime = () => {
		if (!previousSetData) return;
		setCurrentWorkout(
			produce(currentWorkout, (draft) => {
				const draftSet = draft.exercises[props.exerciseIdx].sets[props.setIdx];
				draftSet.statistic = previousSetData as WorkoutSetStatistic;
			}),
		);
	};

	const lastTimeLabel =
		previousSetData && showWeight
			? `${displayWeightWithUnit(exercise.unitSystem, previousSetData.weight)} × ${previousSetData.reps ?? "–"}`
			: previousSetData?.reps
				? `${previousSetData.reps} reps`
				: null;

	return (
		<Stack gap="xs">
			<Text size="sm" fw={600} lineClamp={1}>
				{exerciseDetails?.name || "…"}{" "}
				<Text span c="dimmed" size="sm">
					· Set {props.setIdx + 1} of {exercise.sets.length}
				</Text>
			</Text>
			{showWeight || showReps ? (
				<Group wrap="nowrap" gap="xs">
					{showWeight ? (
						<Stepper
							label={isMetric ? "kg" : "lb"}
							value={set.statistic.weight}
							onStep={(d) => stepStat("weight", d)}
						/>
					) : null}
					{showReps ? (
						<Stepper
							label="reps"
							value={set.statistic.reps}
							onStep={(d) => stepStat("reps", d)}
						/>
					) : null}
				</Group>
			) : (
				<Text size="xs" c="dimmed">
					Enter this set's values above.
				</Text>
			)}
			<Group wrap="nowrap" gap="xs">
				<Button
					flex={1}
					size="md"
					variant="default"
					disabled={!lastTimeLabel}
					onClick={copyLastTime}
					leftSection={<IconHistory size={18} />}
				>
					{lastTimeLabel ? `Last: ${lastTimeLabel}` : "No history"}
				</Button>
				<Button
					flex={1}
					size="md"
					color="green"
					onClick={confirmSet}
					leftSection={<IconCheck size={20} />}
					disabled={isSetConfirmationDisabled(exercise.lot, set.statistic)}
				>
					Done
				</Button>
			</Group>
		</Stack>
	);
};

export const WorkoutActionBar = (props: {
	stopTimer: () => void;
	onFinish: () => void;
	isWorkoutPaused: boolean;
	isSaveBtnLoading: boolean;
	playCheckSound: () => void;
	startTimer: FuncStartTimer;
	toggleTimerDrawer: () => void;
}) => {
	const [currentWorkout] = useCurrentWorkout();
	const [currentTimer] = useCurrentWorkoutTimerAtom();
	if (!currentWorkout) return null;
	const active = getActiveSet(currentWorkout);

	return (
		<Paper
			shadow="xl"
			withBorder
			radius={0}
			style={{
				right: 0,
				bottom: 0,
				zIndex: 99,
				position: "fixed",
				left: "var(--app-shell-navbar-offset, 0rem)",
				paddingBottom:
					"calc(var(--mantine-spacing-sm) + env(safe-area-inset-bottom))",
			}}
			pt="sm"
		>
			<Container size="sm">
				<Stack gap="xs">
					{currentTimer ? (
						<Button
							size="compact-md"
							variant="light"
							color="orange"
							onClick={props.toggleTimerDrawer}
						>
							Rest&nbsp;
							<RestTimer />
						</Button>
					) : null}
					{active ? (
						<ActiveSetControls
							key={`${active.exerciseIdx}-${active.setIdx}`}
							setIdx={active.setIdx}
							exerciseIdx={active.exerciseIdx}
							stopTimer={props.stopTimer}
							startTimer={props.startTimer}
							playCheckSound={props.playCheckSound}
							isWorkoutPaused={props.isWorkoutPaused}
						/>
					) : (
						<Group justify="space-between" wrap="nowrap">
							<Text fw={600}>All sets done</Text>
							<Box>
								<Button
									size="md"
									color="green"
									onClick={props.onFinish}
									loading={props.isSaveBtnLoading}
									disabled={props.isWorkoutPaused}
								>
									Finish workout
								</Button>
							</Box>
						</Group>
					)}
				</Stack>
			</Container>
		</Paper>
	);
};
