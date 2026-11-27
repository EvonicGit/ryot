import { Anchor, Flex, Text } from "@mantine/core";
import { useCoreDetails } from "~/lib/shared/hooks";

export const Footer = () => {
	const coreDetails = useCoreDetails();

	return (
		<Flex gap={80} justify="center">
			{!coreDetails.isServerKeyValidated ? (
				<Anchor
					target="_blank"
					rel="noopener noreferrer"
					href={coreDetails.websiteUrl}
				>
					<Text c="red" fw="bold">
						Ryot Pro
					</Text>
				</Anchor>
			) : null}
			<Text c="grape" fw="bold" visibleFrom="md">
				{coreDetails.version}
			</Text>
		</Flex>
	);
};
