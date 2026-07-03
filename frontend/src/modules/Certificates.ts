// Determines whether uploading a certificate with the given CN would change
// the domain names of an existing certificate record
const certificateDomainChanged = (existingDomains: string[] | undefined, newCn?: string): boolean => {
	if (!existingDomains?.length) {
		return false;
	}
	const next = newCn?.trim().toLowerCase();
	if (!next) {
		return true;
	}
	return !existingDomains.some((domain) => domain.toLowerCase() === next);
};

export { certificateDomainChanged };
