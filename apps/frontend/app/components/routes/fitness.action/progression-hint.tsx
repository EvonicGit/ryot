import { Text } from "@mantine/core";
import {
	ExerciseLot,
	SetLot,
	type UserUnitSystem,
} from "@ryot/generated/graphql/backend/graphql";
import { IconTrendingUp } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { displayWeightWithUnit } from "~/components/fitness/utils";
import { dayjsLib } from "~/lib/shared/date-utils";
import { useUserExerciseDetails } from "~/lib/shared/hooks";
import { type Exercise, getWorkoutDetails } from "~/lib/state/fitness";

export type ProgressionRule = {
	unit: string;
	setsNeeded: number;
	thresholdReps: number;
};

/**
 * Reads the double-progression rule from a "Coach target" exercise note, e.g.
 * "Aim for 10-15 reps. When you can do at least 2 sets at 15 reps, increase the weight."
 * The threshold comes from the "When you can do" clause (not the top of the range),
 * because the two do not always agree. Drop-set rules are not handled.
 */
export const parseProgressionRule = (
	notes: string[],
): ProgressionRule | null => {
	const note = notes.find((n) => /coach target/i.test(n));
	if (!note || /drop/i.test(note)) return null;
	const clause = note.split(/when you can do/i)[1];
	if (!clause) return null;
	const setsMatch = clause.match(/(\d+)\s+sets?\b/i);
	if (!setsMatch) return null;
	const setsNeeded = Number(setsMatch[1]);
	const thresholdMatch = clause.match(/(\d+)\s+(reps?|steps?)\b/i);
	if (thresholdMatch)
		return {
			setsNeeded,
			unit: thresholdMatch[2].toLowerCase(),
			thresholdReps: Number(thresholdMatch[1]),
		};
	if (!/target reps/i.test(clause)) return null;
	const rangeMatch = note.match(/(\d+)\s*(?:-|to)\s*(\d+)\s+(reps?|steps?)\b/i);
	if (!rangeMatch) return null;
	return {
		setsNeeded,
		unit: rangeMatch[3].toLowerCase(),
		thresholdReps: Number(rangeMatch[2]),
	};
};

type LastSession = {
	topWeight: number;
	setsAtTarget: number;
	workingSets: number;
};

type LastSessionSource = {
	name: string;
	date: string;
	sets: Array<{ reps: number; weight: number }>;
};

/**
 * The last time this exercise was done in a workout with the same name
 * (e.g. the previous "Upper 13"), falling back to the most recent session.
 * The same exercise can appear in other routines with a different rep scheme.
 */
const useLastSession = (
	exerciseId: string,
	workoutName: string,
	skipWorkoutId?: string,
) => {
	const { data: userExerciseDetails } = useUserExerciseDetails(exerciseId);
	const entries = (userExerciseDetails?.history || [])
		.filter((h) => h.workoutId !== skipWorkoutId)
		.slice(0, 10);
	return useQuery({
		enabled: entries.length > 0,
		queryKey: [
			"progressionLastSession",
			workoutName,
			entries.map((e) => `${e.workoutId}:${e.idx}`).join(","),
		],
		queryFn: async () => {
			let fallback: LastSessionSource | null = null;
			for (const entry of entries) {
				const workout = await getWorkoutDetails(entry.workoutId);
				const exercise = workout.details.information.exercises[entry.idx];
				if (!exercise) continue;
				const source: LastSessionSource = {
					name: workout.details.name,
					date: workout.details.startTime,
					sets: exercise.sets
						.filter((s) => s.lot === SetLot.Normal)
						.map((s) => ({
							reps: Number(s.statistic.reps || 0),
							weight: Number(s.statistic.weight || 0),
						})),
				};
				if (source.name.trim() === workoutName.trim()) return source;
				fallback ??= source;
			}
			return fallback;
		},
	});
};

const summariseLastSession = (
	sets: Array<{ reps: number; weight: number }>,
	rule: ProgressionRule,
): LastSession | null => {
	if (sets.length === 0) return null;
	const topWeight = Math.max(...sets.map((s) => s.weight));
	const setsAtTarget = sets.filter(
		(s) => s.weight === topWeight && s.reps >= rule.thresholdReps,
	).length;
	return { topWeight, setsAtTarget, workingSets: sets.length };
};

export const ProgressionHint = (props: {
	exercise: Exercise;
	workoutName: string;
	skipWorkoutId?: string;
	unitSystem: UserUnitSystem;
}) => {
	const rule =
		props.exercise.lot === ExerciseLot.RepsAndWeight
			? parseProgressionRule(props.exercise.notes)
			: null;
	const { data: source } = useLastSession(
		props.exercise.exerciseId,
		props.workoutName,
		props.skipWorkoutId,
	);
	if (!rule || !source) return null;
	const last = summariseLastSession(source.sets, rule);
	if (!last) return null;
	const ready = last.setsAtTarget >= rule.setsNeeded;
	const atWeight =
		last.topWeight > 0
			? ` at ${displayWeightWithUnit(props.unitSystem, last.topWeight)}`
			: "";
	const when = `${source.name}, ${dayjsLib(source.date).format("D MMM")}`;
	const evidence = `Last time (${when}): ${last.setsAtTarget} of ${last.workingSets} sets hit ${rule.thresholdReps} ${rule.unit}${atWeight}.`;

	return ready ? (
		<Text size="sm" c="teal" fw={600}>
			<IconTrendingUp size={16} style={{ verticalAlign: "text-bottom" }} />{" "}
			Ready to increase the weight. {evidence}
		</Text>
	) : (
		<Text size="xs" c="dimmed">
			Increase once {rule.setsNeeded} sets hit {rule.thresholdReps} {rule.unit}.{" "}
			{evidence}
		</Text>
	);
};
