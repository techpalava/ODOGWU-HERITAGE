import LegalDocumentView from "./LegalDocumentView";
import { TERMS_AND_CONDITIONS } from "../data/legalContent";

export default function TermsView() {
  return <LegalDocumentView document={TERMS_AND_CONDITIONS} />;
}
