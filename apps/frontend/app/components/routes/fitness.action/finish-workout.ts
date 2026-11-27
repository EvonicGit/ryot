import { notifications } from "@mantine/notifications";
import {
	CreateOrUpdateUserWorkoutDocument,
	CreateOrUpdateUserWorkoutTemplateDocument,
} from "@ryot/generated/graphql/backend/graphql";
import { RESET } from "jotai/utils";
import { useNavigate } from "react-router";
import { $path } from "safe-routes";
import { match } from "ts-pattern";
import { useApplicationEvents } from "~/lib/shared/hooks";
import {
	clientGqlService,
	queryClient,
	queryFactory,
} from "~/lib/shared/react-query";
import { openConfirmationModal } from "~/lib/shared/ui-utils";
import {
	currentWorkoutToCreateWorkoutInput,
	useCurrentWorkout,
} from "~/lib/state/fitness";
import { useOnboardingTour } from "~/lib/state/onboarding-tour";
import { FitnessAction, FitnessEntity } from "~/lib/types";

export const useFinishWorkout = (props: {
	stopTimer: () => void;
	setIsSaveBtnLoading: (value: boolean) => void;
	loaderData: { action: FitnessAction; isCreatingTemplate: boolean };
}) => {
	const navigate = useNavigate();
	const events = useApplicationEvents();
	const { advanceOnboardingTourStep } = useOnboardingTour();
	const [currentWorkout, setCurrentWorkout] = useCurrentWorkout();

	return () => {
		if (!currentWorkout) return;
		if (!currentWorkout.name) {
			notifications.show({
				color: "red",
				message: `Please give a name to the ${
					props.loaderData.isCreatingTemplate ? "template" : "workout"
				}`,
			});
			return;
		}
		openConfirmationModal(
			props.loaderData.isCreatingTemplate
				? "Only sets that have data will added. Are you sure you want to save this template?"
				: "Only sets marked as confirmed will be recorded. Are you sure you want to finish this workout?",
			async () => {
				props.setIsSaveBtnLoading(true);
				advanceOnboardingTourStep();

				await new Promise((r) => setTimeout(r, 1000));
				const input = currentWorkoutToCreateWorkoutInput(
					currentWorkout,
					props.loaderData.isCreatingTemplate,
				);
				for (const exercise of currentWorkout.exercises) {
					queryClient.removeQueries({
						queryKey: queryFactory.fitness.userExerciseDetails(
							exercise.exerciseId,
						).queryKey,
					});
				}
				props.stopTimer();
				try {
					const [entityId, fitnessEntity] = await match(
						props.loaderData.isCreatingTemplate,
					)
						.with(true, () =>
							clientGqlService
								.request(CreateOrUpdateUserWorkoutTemplateDocument, input)
								.then((c) => [
									c.createOrUpdateUserWorkoutTemplate,
									FitnessEntity.Templates,
								]),
						)
						.with(false, () =>
							clientGqlService
								.request(CreateOrUpdateUserWorkoutDocument, input)
								.then((c) => [
									c.createOrUpdateUserWorkout,
									FitnessEntity.Workouts,
								]),
						)
						.exhaustive();
					if (props.loaderData.action === FitnessAction.LogWorkout)
						events.createWorkout();
					setCurrentWorkout(RESET);
					navigate(
						$path("/fitness/:entity/:id", {
							id: entityId,
							entity: fitnessEntity,
						}),
					);
				} catch (e) {
					notifications.show({
						color: "red",
						message: `Error while saving workout: ${JSON.stringify(e)}`,
					});
					props.setIsSaveBtnLoading(false);
				}
			},
		);
	};
};
