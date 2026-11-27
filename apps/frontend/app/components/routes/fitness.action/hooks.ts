import { isNumber, sortBy } from "@ryot/ts-utils";
import { Howl } from "howler";
import { produce } from "immer";
import { useMemo } from "react";
import { useUserPreferences } from "~/lib/shared/hooks";
import { type InProgressWorkout, useCurrentWorkout } from "~/lib/state/fitness";
import { DEFAULT_SET_TIMEOUT_DELAY_MS } from "./utils";

export const focusOnExercise = (idx: number) => {
	setTimeout(() => {
		const exercise = document.getElementById(idx.toString());
		exercise?.scrollIntoView({ behavior: "smooth" });
	}, DEFAULT_SET_TIMEOUT_DELAY_MS);
};

export const sortSupersetExercisesByWorkoutOrder = (
	supersetExercises: string[],
	workoutExercises: InProgressWorkout["exercises"],
) =>
	sortBy(supersetExercises, (s) =>
		workoutExercises.findIndex((e) => e.identifier === s),
	);

export const getProgressOfExercise = (cw: InProgressWorkout, index: number) => {
	const isCompleted = cw.exercises[index].sets.every((s) => s.confirmedAt);
	return isCompleted
		? ("complete" as const)
		: cw.exercises[index].sets.some((s) => s.confirmedAt)
			? ("in-progress" as const)
			: ("not-started" as const);
};

export const getNextSetInWorkout = (
	currentSetIdx: number,
	currentExerciseIdx: number,
	currentWorkout: InProgressWorkout,
) => {
	const currentExercise = currentWorkout.exercises[currentExerciseIdx];
	const partOfSuperset = currentWorkout.supersets.find((superset) =>
		superset.exercises.includes(currentExercise.identifier),
	);
	const areAllSetsConfirmed = currentExercise.sets.every((s) => s.confirmedAt);
	if (partOfSuperset) {
		const sortedExercises = sortSupersetExercisesByWorkoutOrder(
			partOfSuperset.exercises,
			currentWorkout.exercises,
		);
		const nextExerciseWithIncompleteSets = currentWorkout.exercises.find(
			(e) =>
				e.identifier !== currentExercise.identifier &&
				sortedExercises.includes(e.identifier) &&
				e.sets.some((s) => !s.confirmedAt),
		);
		if (nextExerciseWithIncompleteSets) {
			const exerciseIdx = currentWorkout.exercises.findIndex(
				(e) => e.identifier === nextExerciseWithIncompleteSets.identifier,
			);
			const setIdx = nextExerciseWithIncompleteSets.sets.findIndex(
				(s) => !s.confirmedAt,
			);
			return { exerciseIdx, setIdx: setIdx, wasLastSet: areAllSetsConfirmed };
		}
	}
	if (areAllSetsConfirmed) {
		for (
			let i = currentExerciseIdx + 1;
			i < currentWorkout.exercises.length;
			i++
		) {
			const exerciseProgress =
				getProgressOfExercise(currentWorkout, i) !== "complete";
			if (exerciseProgress)
				return {
					setIdx: 0,
					exerciseIdx: i,
					wasLastSet: true,
				};
		}
	}
	const isLastSetOfLastExercise =
		currentExerciseIdx === currentWorkout.exercises.length - 1 &&
		currentSetIdx ===
			currentWorkout.exercises[currentExerciseIdx].sets.length - 1;
	if (isLastSetOfLastExercise) return { wasLastSet: true };
	return {
		wasLastSet: false,
		setIdx: currentSetIdx + 1,
		exerciseIdx: currentExerciseIdx,
	};
};

/**
 * The set the user should do next: the next set after the most recently
 * confirmed one (superset-aware), otherwise the first unconfirmed set.
 */
export const getActiveSet = (workout: InProgressWorkout) => {
	let latest: { exerciseIdx: number; setIdx: number; at: string } | null = null;
	for (const [exerciseIdx, exercise] of workout.exercises.entries())
		for (const [setIdx, set] of exercise.sets.entries())
			if (
				typeof set.confirmedAt === "string" &&
				(!latest || set.confirmedAt > latest.at)
			)
				latest = { exerciseIdx, setIdx, at: set.confirmedAt };
	const firstUnconfirmedIn = (exerciseIdx: number) => {
		const setIdx =
			workout.exercises[exerciseIdx]?.sets.findIndex((s) => !s.confirmedAt) ??
			-1;
		return setIdx >= 0 ? { exerciseIdx, setIdx } : null;
	};
	if (latest) {
		const next = getNextSetInWorkout(
			latest.setIdx,
			latest.exerciseIdx,
			workout,
		);
		if (isNumber(next.exerciseIdx)) {
			const candidate = firstUnconfirmedIn(next.exerciseIdx);
			if (candidate) return candidate;
		}
	}
	for (let i = 0; i < workout.exercises.length; i++) {
		const candidate = firstUnconfirmedIn(i);
		if (candidate) return candidate;
	}
	return null;
};

export const usePerformTasksAfterSetConfirmed = () => {
	const [currentWorkout, setCurrentWorkout] = useCurrentWorkout();

	const performTask = async (setIdx: number, exerciseIdx: number) => {
		const exerciseId = currentWorkout?.exercises[exerciseIdx].exerciseId;
		if (!exerciseId) return;
		let exerciseIdxToFocusOn: number | undefined;
		setCurrentWorkout((cw) =>
			produce(cw, (draft) => {
				if (!draft) return;
				const currentExercise = draft.exercises[exerciseIdx];
				const nextSet = getNextSetInWorkout(setIdx, exerciseIdx, draft);
				exerciseIdxToFocusOn = nextSet.exerciseIdx;
				if (nextSet.wasLastSet) {
					currentExercise.isCollapsed = true;
					if (isNumber(nextSet.exerciseIdx)) {
						const nextExercise = draft.exercises[nextSet.exerciseIdx];
						if (nextExercise) nextExercise.isCollapsed = false;
					}
				}
			}),
		);
		if (isNumber(exerciseIdxToFocusOn)) {
			focusOnExercise(exerciseIdxToFocusOn);
		}
	};

	return performTask;
};

export const usePlayFitnessSound = (fileName: string) => {
	const userPreferences = useUserPreferences();
	const sound = useMemo(
		() => new Howl({ src: [`/sounds/${fileName}.mp3`] }),
		[],
	);

	const playSound = () => {
		if (!userPreferences.fitness.logging.muteSounds) sound.play();
	};

	return playSound;
};
