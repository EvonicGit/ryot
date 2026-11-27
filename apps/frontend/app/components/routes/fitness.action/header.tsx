import { Button, Divider, Group, SimpleGrid } from "@mantine/core";
import { sum } from "@ryot/ts-utils";
import { RESET } from "jotai/utils";
import { useNavigate } from "react-router";
import { $path } from "safe-routes";
import { displayWeightWithUnit } from "~/components/fitness/utils";
import {
	useDeleteS3AssetMutation,
	useUserUnitSystem,
} from "~/lib/shared/hooks";
import { openConfirmationModal } from "~/lib/shared/ui-utils";
import { useCurrentWorkout } from "~/lib/state/fitness";
import { OnboardingTourStepTarget } from "~/lib/state/onboarding-tour";
import type { FitnessAction } from "~/lib/types";
import { useFinishWorkout } from "./finish-workout";
import { NameAndOtherInputs } from "./miscellaneous";
import { RestTimer, WorkoutDurationTimer } from "./rest-timer";
import { StatDisplay } from "./stat-display-and-input";

interface HeaderProps {
	stopTimer: () => void;
	isWorkoutPaused: boolean;
	numberOfExercises: number;
	isSaveBtnLoading: boolean;
	toggleTimerDrawer: () => void;
	shouldDisplayFinishButton: boolean;
	shouldDisplayCancelButton: boolean;
	shouldDisplayWorkoutTimer: boolean;
	shouldDisplayReorderButton: boolean;
	setIsSaveBtnLoading: (value: boolean) => void;
	openReorderDrawer: (exerciseIdentifier: string | null) => void;
	setAssetsModalOpened: (value: string | null | undefined) => void;
	loaderData: {
		action: FitnessAction;
		isUpdatingWorkout: boolean;
		isCreatingTemplate: boolean;
	};
}

export function WorkoutHeader(props: HeaderProps) {
	const navigate = useNavigate();
	const unitSystem = useUserUnitSystem();
	const deleteS3AssetMutation = useDeleteS3AssetMutation();
	const [currentWorkout, setCurrentWorkout] = useCurrentWorkout();
	const finishWorkout = useFinishWorkout({
		stopTimer: props.stopTimer,
		loaderData: props.loaderData,
		setIsSaveBtnLoading: props.setIsSaveBtnLoading,
	});

	if (!currentWorkout) return null;

	return (
		<>
			<NameAndOtherInputs
				isCreatingTemplate={props.loaderData.isCreatingTemplate}
				openAssetsModal={() => props.setAssetsModalOpened(null)}
			/>
			<Group>
				<WorkoutDurationTimer
					isWorkoutPaused={props.isWorkoutPaused}
					isUpdatingWorkout={props.loaderData.isUpdatingWorkout}
					isCreatingTemplate={props.loaderData.isCreatingTemplate}
				/>
				<StatDisplay
					name="Exercises"
					value={
						props.loaderData.isCreatingTemplate
							? props.numberOfExercises.toString()
							: `${
									currentWorkout.exercises
										.map((e) => e.sets.every((s) => s.confirmedAt))
										.filter(Boolean).length
								}/${props.numberOfExercises}`
					}
				/>
				<StatDisplay
					name="Weight"
					value={`${displayWeightWithUnit(
						unitSystem,
						sum(
							currentWorkout.exercises
								.flatMap((e) => e.sets)
								.flatMap((s) =>
									props.loaderData.isCreatingTemplate || s.confirmedAt
										? Number(s.statistic.reps || 0) *
											Number(s.statistic.weight || 0)
										: 0,
								),
						).toFixed(),
					)}`}
				/>
				<StatDisplay
					name="Sets"
					value={sum(
						currentWorkout.exercises
							.flatMap((e) => e.sets)
							.flatMap((s) =>
								props.loaderData.isCreatingTemplate || s.confirmedAt ? 1 : 0,
							),
					).toString()}
				/>
			</Group>
			<Divider />
			<SimpleGrid
				cols={
					Number(props.shouldDisplayWorkoutTimer) +
					Number(props.shouldDisplayReorderButton) +
					Number(props.shouldDisplayFinishButton) +
					Number(props.shouldDisplayCancelButton)
				}
			>
				{props.shouldDisplayWorkoutTimer ? (
					<Button
						radius="md"
						color="orange"
						variant="subtle"
						size="compact-sm"
						onClick={props.toggleTimerDrawer}
					>
						<RestTimer />
					</Button>
				) : null}
				{props.shouldDisplayReorderButton ? (
					<Button
						radius="md"
						color="blue"
						variant="subtle"
						size="compact-sm"
						onClick={() => props.openReorderDrawer(null)}
					>
						Reorder
					</Button>
				) : null}
				{props.shouldDisplayFinishButton ? (
					<Button
						radius="md"
						color="green"
						variant="subtle"
						size="compact-sm"
						loading={props.isSaveBtnLoading}
						disabled={props.isWorkoutPaused}
						className={OnboardingTourStepTarget.FinishWorkout}
						onClick={finishWorkout}
					>
						{props.loaderData.isCreatingTemplate ||
						props.loaderData.isUpdatingWorkout
							? "Save"
							: "Finish"}
					</Button>
				) : null}
				{props.shouldDisplayCancelButton ? (
					<Button
						radius="md"
						color="red"
						variant="subtle"
						size="compact-sm"
						onClick={() => {
							openConfirmationModal(
								`Are you sure you want to cancel this ${
									props.loaderData.isCreatingTemplate ? "template" : "workout"
								}?`,
								async () => {
									await Promise.all(
										currentWorkout.exercises.flatMap((e) =>
											[...e.images, ...e.videos].map((asset) =>
												deleteS3AssetMutation.mutateAsync(asset),
											),
										),
									);
									navigate($path("/"), { replace: true });
									setCurrentWorkout(RESET);
								},
							);
						}}
					>
						Cancel
					</Button>
				) : null}
			</SimpleGrid>
			<Divider />
		</>
	);
}
