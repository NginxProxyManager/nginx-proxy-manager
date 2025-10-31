import CertificatesClient from "./CertificatesClient";
import { listCertificates } from "@/src/lib/models/certificates";

export default function CertificatesPage() {
  const certificates = listCertificates();
  return <CertificatesClient certificates={certificates} />;
}
