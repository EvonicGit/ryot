import { Text } from "@mantine/core";
import { ExerciseLot } from "@ryot/generated/graphql/backend/graphql";
import { displayWeightWithUnit } from "~/components/fitness/utils";
import { useGetExerciseAtIndex } from "~/lib/state/fitness";

/** One line shown in place of a collapsed exercise's sets, e.g. "3/3 sets · 20 kg × 12, 12, 10". */
export const CollapsedExerciseSummary = (props: { exerciseIdx: number }) => {
	const exercise = useGetExerciseAtIndex(props.exerciseIdx);
	if (!exercise) return null;
	const done = exercise.sets.filter((s) => s.confirmedAt);
	const total = exercise.sets.length;
	const isComplete = total > 0 && done.length === total;
	let detail = "";
	if (done.length > 0 && exercise.lot === ExerciseLot.RepsAndWeight) {
		const topWeight = Math.max(
			...done.map((s) => Number(s.statistic.weight || 0)),
		);
		const repsAtTop = done
			.filter((s) => Number(s.statistic.weight || 0) === topWeight)
			.map((s) => s.statistic.reps ?? "–")
			.join(", ");
		detail = ` · ${displayWeightWithUnit(exercise.unitSystem, topWeight)} × ${repsAtTop}`;
	} else if (done.length > 0 && exercise.lot === ExerciseLot.Reps) {
		detail = ` · ${done.map((s) => s.statistic.reps ?? "–").join(", ")} reps`;
	}

	return (
		<Text size="sm" c={isComplete ? "teal" : "dimmed"} mt={-8} mb={4}>
			{done.length}/{total} sets{detail}
		</Text>
	);
};
