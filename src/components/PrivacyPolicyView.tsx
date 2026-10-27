import LegalDocumentView from "./LegalDocumentView";
import { PRIVACY_POLICY } from "../data/legalContent";

export default function PrivacyPolicyView() {
  return <LegalDocumentView document={PRIVACY_POLICY} />;
}
