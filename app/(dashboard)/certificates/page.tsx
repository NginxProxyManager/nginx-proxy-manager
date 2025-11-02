import CertificatesClient from "./CertificatesClient";
import { listCertificates } from "@/src/lib/models/certificates";

export default async function CertificatesPage() {
  const certificates = await listCertificates();
  return <CertificatesClient certificates={certificates} />;
}
