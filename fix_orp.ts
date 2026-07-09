import fs from 'fs';
let orp = fs.readFileSync('src/components/OrderRoutingPanel.tsx', 'utf8');
orp = orp.replace(/import \{ RoutingPresentationModel, RoutingActionModel \} from "\.\.\/engine\/OrderRoutingEngine";\n/, '');
// Wait, my previous script did:
// orp = orp.replace(/import \{ RoutingPresentationModel, RoutingActionModel, OrderRoutingEngine \} from "\.\.\/engine\/OrderRoutingEngine";/, 'import { OrderRoutingEngine } from "../engine/OrderRoutingEngine";');
// But evidently it didn't match perfectly. Let's just do a simpler replace.
orp = orp.replace(/RoutingPresentationModel,\s*RoutingActionModel,\s*/, '');
orp = orp.replace(/RoutingPresentationModel,\s*/, '');
orp = orp.replace(/RoutingActionModel,\s*/, '');
fs.writeFileSync('src/components/OrderRoutingPanel.tsx', orp);
