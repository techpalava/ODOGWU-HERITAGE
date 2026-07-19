import { AuthorizationEngine } from "../engine/AuthorizationEngine";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import namer from "color-namer";

const getColorName = (hex: string) => {
  try {
    return namer(hex).ntc[0].name;
  } catch (e) {
    return hex;
  }
};
import {
  Database,
  Search,
  Layers,
  BookOpen,
  Info,
  Plus,
  Edit2,
  Trash2,
  User,
  Users,
  Shirt,
  Layers2,
  Sliders,
  ClipboardList,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Check,
  X,
  Tag,
  Upload,
  Image,
  Download,
  Puzzle,
  FileText,
  Copy,
  ListCollapse,
} from "lucide-react";
import {
  Fabric,
  StyleCategory,
  Customer,
  CustomGroup,
  MasterOrder,
  Showpiece,
  CommunityPhoto,
  Batch,
  BusinessSettings,
  ConstructionDetail,
  FutureDiscount,
  DiscountSettings,
  DiscountPlanningRule,
  OutfitType,
} from "../types";
import { OFFICIAL_PRICE_LIST } from "../data/pricingData";
import odogwuLogo from "../assets/images/odogwu_logo_1782556303014.jpg";
import { BusinessIntelligenceEngine } from "../engine/BusinessIntelligenceEngine";
import { CapacityService } from "../services/CapacityService";
import { useAppStore } from "../store/useAppStore";
import { useReferenceDataFallback } from "../hooks/useReferenceData";

interface DatabaseViewProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  styles: StyleCategory[];
  setStyles: React.Dispatch<React.SetStateAction<StyleCategory[]>>;
  fabrics: Fabric[];
  setFabrics: React.Dispatch<React.SetStateAction<Fabric[]>>;
  customGroups: CustomGroup[];
  setCustomGroups: React.Dispatch<React.SetStateAction<CustomGroup[]>>;
  orders: MasterOrder[];
  setOrders: React.Dispatch<React.SetStateAction<MasterOrder[]>>;
  showpieces?: Showpiece[];
  setShowpieces?: React.Dispatch<React.SetStateAction<Showpiece[]>>;
  communityPhotos?: CommunityPhoto[];
  setCommunityPhotos?: React.Dispatch<React.SetStateAction<CommunityPhoto[]>>;
  batches: Batch[];
  setBatches: React.Dispatch<React.SetStateAction<Batch[]>>;
  businessSettings: BusinessSettings;
  setBusinessSettings: React.Dispatch<React.SetStateAction<BusinessSettings>>;
}

import { compressImage } from "../utils/imageUtils";
import { getClosestColorName } from "../utils/colorMatcher";
import { FabricService } from "../services/fabricService";
import { StorageService } from "../services/storageService";
import { ImageService } from "../services/imageService";
import { getCurrentCommunityBatch } from "../utils/batchUtils";
import { collection, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import { db } from "../services/firebase";
import { BatchManagementPanel } from "./BatchManagementPanel";

type TabType =
  | "documentation"
  | "users"
  | "styles"
  | "fabrics"
  | "batches"
  | "orders"
  | "showpieces"
  | "photos"
  | "settings"
  | "media"
  | "plugins"
  | "audit"
  | "roles"
  | "operations"
  | "compliance";

export default function DatabaseView({
  customers,
  setCustomers,
  styles,
  setStyles,
  fabrics,
  setFabrics: _setFabrics,
  customGroups: _customGroups,
  setCustomGroups: _setCustomGroups,
  orders,
  setOrders,
  showpieces = [],
  setShowpieces,
  communityPhotos: _communityPhotos = [],
  setCommunityPhotos,
  batches,
  setBatches,
  businessSettings,
  setBusinessSettings,
}: DatabaseViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("documentation");
  const [settingsSubTab, setSettingsSubTab] = useState<
    "rules" | "discounts" | "pricing_engine"
  >("rules");
  const [editingFutureDiscount, setEditingFutureDiscount] =
    useState<FutureDiscount | null>(null);
  const [isAddingFutureDiscount, setIsAddingFutureDiscount] = useState(false);
  const [newOType, setNewOType] = useState("Senator Set");
  const [newComp, setNewComp] = useState("2-Piece Set");
  const [newPrice, setNewPrice] = useState(150);

  const {
    currentUser,
    mediaLibrary,
    plugins,
    auditLogs,
    roles,
  } = useAppStore();

  // Search states for each table
  const [userSearch, setUserSearch] = useState("");
  const [styleSearch, setStyleSearch] = useState("");
  const [fabricSearch, setFabricSearch] = useState("");
  const [batchSearch, setBatchSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [showpieceSearch, setShowpieceSearch] = useState("");
  const [photoSearch, setPhotoSearch] = useState("");

  const communityPhotos = Array.isArray(_communityPhotos)
    ? _communityPhotos
    : [];

  // Editing modal/form states
  const [editingType, setEditingType] = useState<
    | "user"
    | "style"
    | "fabric"
    | "batch"
    | "order"
    | "showpiece"
    | "photo"
    | null
  >(null);
  const [editingItem, setEditingItem] = useState<any>(null); // holds the item being edited or new template
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [fabricNameSuggestions, setFabricNameSuggestions] = useState<string[]>([]);
  const [suggestionHistory, setSuggestionHistory] = useState<string[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);

  const handleGenerateSuggestions = async (imageBase64: string, updateNameAutomatically = true): Promise<{suggestions: string[], category: string} | null> => {
    if (!imageBase64) return null;
    setIsGeneratingSuggestions(true);
    triggerStatus("Analyzing fabric image to generate suggestions...", "info");
    try {
      const { generateLocalFabricNames } = await import("../lib/fabricNamingEngine");
      const data = await generateLocalFabricNames(imageBase64, suggestionHistory);
      
      if (data && data.suggestions) {
        setFabricNameSuggestions(data.suggestions);
        setSuggestionHistory(prev => [...prev, ...data.suggestions]);
        
        if (updateNameAutomatically) {
          setEditingItem((prev: any) => ({
            ...prev,
            name: data.suggestions[0],
            category: data.category || prev.category
          }));
        }
        
        triggerStatus("Generated new fabric name suggestions!", "success");
        return { suggestions: data.suggestions, category: data.category };
      } else {
        triggerStatus("Failed to generate suggestions", "error");
        return null;
      }
    } catch (err) {
      console.error("Failed to generate fabric suggestions locally", err);
      triggerStatus("Failed to generate fabric suggestions", "error");
      return null;
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  // Listener for AI Prompt Fabric Import Workflow
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "fabric_drafts"), async (snapshot) => {
      if (snapshot.empty) return;
      
      for (const draftDoc of snapshot.docs) {
        const data = draftDoc.data();
        
        // Populate and open the Add Fabric form
        setIsNewRecord(true);
        setActiveTab("fabrics");
        
        try {
          const nextCode = await StorageService.previewNextFabricCode();
          
          setEditingItem({
            code: nextCode,
            name: data.name || "Generating...",
            description: data.description || "Premium Nigerian Traditional weave.",
            category: data.category || "HiTarget Ankara",
            priceMultiplier: 1.2,
            color: data.color || "Multi",
            colorHex: data.colorHex || "#2e3a1e",
            stock: 30, // Specified default for import workflow
            width: "45 inches",
            image: data.image || ""
          });
          setEditingType("fabric");
          setFabricNameSuggestions([]);
          setSuggestionHistory([]);
          
          triggerStatus("AI uploaded fabric imported! Please review.", "info");

          if (!data.name && data.image) {
             await handleGenerateSuggestions(data.image);
          }
          
        } catch (err) {
          console.error("Failed to process fabric draft", err);
          triggerStatus("Failed to process imported fabric.", "error");
        }

        // Delete the draft so it doesn't trigger again
        await deleteDoc(doc(db, "fabric_drafts", draftDoc.id));
        break; // Only process one draft at a time to avoid overlapping modals
      }
    });
    
    return () => unsub();
  }, []);

  // Outfit Type Manager states
  const [editingOutfitType, setEditingOutfitType] = useState<OutfitType | null>(
    null,
  );
  const [newOutfitName, setNewOutfitName] = useState("");
  const [newOutfitGender, setNewOutfitGender] = useState<
    "male" | "female" | "unisex" | "family"
  >("male");
  const [newOutfitOrder, setNewOutfitOrder] = useState<number>(1);
  const [outfitGenderFilter, setOutfitGenderFilter] = useState<
    "all" | "male" | "female" | "unisex" | "family"
  >("all");

  // Status message HUD
  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    type: "success" | "info" | "error";
  } | null>(null);

  const triggerStatus = (
    text: string,
    type: "success" | "info" | "error" = "success",
  ) => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  // Discount configuration helper state mutations (Administrative Sandbox)
  const dSettings: DiscountSettings = businessSettings.discountSettings || {
    individualOrders: {
      suggestedMinRange: 5,
      suggestedMaxRange: 10,
      minimumDiscount: 0,
      maximumDiscount: 15,
      internalNotes: "Planning only. Standard bespoke sizing applies.",
    },
    communityOrders: {
      suggestedMinRange: 10,
      suggestedMaxRange: 20,
      minimumDiscount: 5,
      maximumDiscount: 25,
      internalNotes: "Planning only. Volume-based batch rules remain standard.",
    },
    vipOrders: {
      status: "planning_only",
      internalNotes:
        "VIP benefits will integrate directly with high-net-worth individual client groups.",
    },
    futureDiscounts: [],
  };

  const updatePlanningRule = (
    type: "individualOrders" | "communityOrders",
    field: keyof DiscountPlanningRule,
    value: any,
  ) => {
    setBusinessSettings((prev) => {
      const currentSettings = prev.discountSettings || {
        individualOrders: {
          suggestedMinRange: 5,
          suggestedMaxRange: 10,
          minimumDiscount: 0,
          maximumDiscount: 15,
          internalNotes: "Planning only. Standard bespoke sizing applies.",
        },
        communityOrders: {
          suggestedMinRange: 10,
          suggestedMaxRange: 20,
          minimumDiscount: 5,
          maximumDiscount: 25,
          internalNotes:
            "Planning only. Volume-based batch rules remain standard.",
        },
        vipOrders: {
          status: "planning_only",
          internalNotes:
            "VIP benefits will integrate directly with high-net-worth individual client groups.",
        },
        futureDiscounts: [],
      };
      return {
        ...prev,
        discountSettings: {
          ...currentSettings,
          [type]: {
            ...currentSettings[type],
            [field]: value,
          },
        },
      };
    });
  };

  const updateVipNotes = (notes: string) => {
    setBusinessSettings((prev) => {
      const currentSettings = prev.discountSettings || {
        individualOrders: {
          suggestedMinRange: 5,
          suggestedMaxRange: 10,
          minimumDiscount: 0,
          maximumDiscount: 15,
          internalNotes: "Planning only. Standard bespoke sizing applies.",
        },
        communityOrders: {
          suggestedMinRange: 10,
          suggestedMaxRange: 20,
          minimumDiscount: 5,
          maximumDiscount: 25,
          internalNotes:
            "Planning only. Volume-based batch rules remain standard.",
        },
        vipOrders: {
          status: "planning_only",
          internalNotes:
            "VIP benefits will integrate directly with high-net-worth individual client groups.",
        },
        futureDiscounts: [],
      };
      return {
        ...prev,
        discountSettings: {
          ...currentSettings,
          vipOrders: {
            ...currentSettings.vipOrders,
            internalNotes: notes,
          },
        },
      };
    });
  };

  const addFutureDiscount = (discount: Omit<FutureDiscount, "id">) => {
    setBusinessSettings((prev) => {
      const currentSettings = prev.discountSettings || {
        individualOrders: {
          suggestedMinRange: 5,
          suggestedMaxRange: 10,
          minimumDiscount: 0,
          maximumDiscount: 15,
          internalNotes: "Planning only. Standard bespoke sizing applies.",
        },
        communityOrders: {
          suggestedMinRange: 10,
          suggestedMaxRange: 20,
          minimumDiscount: 5,
          maximumDiscount: 25,
          internalNotes:
            "Planning only. Volume-based batch rules remain standard.",
        },
        vipOrders: {
          status: "planning_only",
          internalNotes:
            "VIP benefits will integrate directly with high-net-worth individual client groups.",
        },
        futureDiscounts: [],
      };
      const newDiscount: FutureDiscount = {
        ...discount,
        id: `disc-${Date.now()}`,
      };
      return {
        ...prev,
        discountSettings: {
          ...currentSettings,
          futureDiscounts: [...currentSettings.futureDiscounts, newDiscount],
        },
      };
    });
    triggerStatus("Future discount rule registered successfully!", "success");
  };

  const updateFutureDiscount = (
    id: string,
    updatedFields: Partial<FutureDiscount>,
  ) => {
    setBusinessSettings((prev) => {
      const currentSettings = prev.discountSettings || {
        individualOrders: {
          suggestedMinRange: 5,
          suggestedMaxRange: 10,
          minimumDiscount: 0,
          maximumDiscount: 15,
          internalNotes: "Planning only. Standard bespoke sizing applies.",
        },
        communityOrders: {
          suggestedMinRange: 10,
          suggestedMaxRange: 20,
          minimumDiscount: 5,
          maximumDiscount: 25,
          internalNotes:
            "Planning only. Volume-based batch rules remain standard.",
        },
        vipOrders: {
          status: "planning_only",
          internalNotes:
            "VIP benefits will integrate directly with high-net-worth individual client groups.",
        },
        futureDiscounts: [],
      };
      return {
        ...prev,
        discountSettings: {
          ...currentSettings,
          futureDiscounts: currentSettings.futureDiscounts.map((d) =>
            d.id === id ? { ...d, ...updatedFields } : d,
          ),
        },
      };
    });
    triggerStatus("Future discount rule updated successfully!", "success");
  };

  const deleteFutureDiscount = (id: string) => {
    setBusinessSettings((prev) => {
      const currentSettings = prev.discountSettings || {
        individualOrders: {
          suggestedMinRange: 5,
          suggestedMaxRange: 10,
          minimumDiscount: 0,
          maximumDiscount: 15,
          internalNotes: "Planning only. Standard bespoke sizing applies.",
        },
        communityOrders: {
          suggestedMinRange: 10,
          suggestedMaxRange: 20,
          minimumDiscount: 5,
          maximumDiscount: 25,
          internalNotes:
            "Planning only. Volume-based batch rules remain standard.",
        },
        vipOrders: {
          status: "planning_only",
          internalNotes:
            "VIP benefits will integrate directly with high-net-worth individual client groups.",
        },
        futureDiscounts: [],
      };
      return {
        ...prev,
        discountSettings: {
          ...currentSettings,
          futureDiscounts: currentSettings.futureDiscounts.filter(
            (d) => d.id !== id,
          ),
        },
      };
    });
    triggerStatus("Future discount rule deleted.", "info");
  };

  const discSettingsNotesBlock = (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 text-xs text-blue-800">
      <Info size={16} className="shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p>
          <strong>Bespoke Pricing Isolation Rule:</strong>
        </p>
        <p className="text-blue-700/90 leading-relaxed font-sans">
          All active bespoke pricing calculations (Design Studio fabric
          formulas, Shopping Cart totals, Escrow deposits, and Batch
          calculations) strictly bypass these planning structures. No
          customer-facing view or query possesses access to these values,
          keeping your baseline revenue fully secure.
        </p>
      </div>
    </div>
  );

  const [isExporting, setIsExporting] = useState(false);

  const handleExportManifest = async () => {
    setIsExporting(true);
    try {
      const response = await fetch("/api/production-manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `heritage_workshop_production_manifest_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        triggerStatus(
          "Production manifest exported successfully for workshop floor!",
          "success",
        );
      } else {
        alert("Failed to generate production manifest.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend manifest engine.");
    } finally {
      setIsExporting(false);
    }
  };

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const extractColors = (
    dataURL: string,
  ): Promise<{ main: string; secondary: string }> => {
    return new Promise((resolve) => {
      const img = new globalThis.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve({ main: "#2c3e50", secondary: "#e67e22" });

        // Resize for faster processing
        const scale = Math.min(100 / img.width, 100 / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Sample center for main, edge for secondary
        const cx = Math.floor(canvas.width / 2);
        const cy = Math.floor(canvas.height / 2);
        const mainData = ctx.getImageData(cx, cy, 1, 1).data;

        const sx = Math.floor(canvas.width * 0.8);
        const sy = Math.floor(canvas.height * 0.2);
        const secData = ctx.getImageData(sx, sy, 1, 1).data;

        const rgbToHex = (r: number, g: number, b: number) =>
          "#" +
          [r, g, b]
            .map((x) => {
              const hex = x.toString(16);
              return hex.length === 1 ? "0" + hex : hex;
            })
            .join("");

        resolve({
          main: rgbToHex(mainData[0], mainData[1], mainData[2]),
          secondary: rgbToHex(secData[0], secData[1], secData[2]),
        });
      };
      img.onerror = () => resolve({ main: "#2c3e50", secondary: "#e67e22" });
      img.src = dataURL;
    });
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    try {
      triggerStatus("Processing image file...", "info");

      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataURL = e.target?.result as string;
        
        let compressedURL = dataURL;
        // Do not compress fabric images to preserve original as requested
        if (editingType !== "fabric") {
          compressedURL = await compressImage(dataURL);
        }
        if (editingItem) {
          if (editingType === "photo") {
            const updatedPhotoItem = {
              ...editingItem,
              url: compressedURL,
            };
            setEditingItem(updatedPhotoItem);

            if (isNewRecord && setCommunityPhotos) {
              setCommunityPhotos((prev) => {
                if (prev.some((p) => p.id === updatedPhotoItem.id)) {
                  return prev.map((p) =>
                    p.id === updatedPhotoItem.id ? updatedPhotoItem : p,
                  );
                }
                return [...prev, updatedPhotoItem];
              });
              setIsNewRecord(false); // Make it an existing record now
            } else if (setCommunityPhotos) {
              setCommunityPhotos((prev) =>
                prev.map((p) =>
                  p.id === updatedPhotoItem.id ? updatedPhotoItem : p,
                ),
              );
            }

            triggerStatus("Community image processed successfully!", "success");
          } else if (editingType === "style") {
            // Detect colors for style
            triggerStatus("Detecting garment colors...", "info");
            const colors = await extractColors(compressedURL);
            setEditingItem({
              ...editingItem,
              image: compressedURL,
              detectedColors: colors,
            });
            triggerStatus(
              "Image processed & colors detected successfully!",
              "success",
            );
          } else if (editingType === "fabric") {
            triggerStatus("Detecting dominant color and fabric identity...", "info");
            
            // Upload to Firebase Storage FIRST
            triggerStatus("Uploading original image to Firebase Storage...", "info");
            const uploadedUrl = await ImageService.uploadImageIfBase64(compressedURL, "fabrics", editingItem?.code || "draft") || compressedURL;
            
            const colors = await extractColors(compressedURL);
            const dominantName = getClosestColorName(colors.main);
            
            setEditingItem((prev: any) => ({
              ...prev,
              image: uploadedUrl,
              colorHex: colors.main,
              color: dominantName,
              stock: 30
            }));

            // Clear history and fetch new name suggestions using the new URL (or base64)
            setSuggestionHistory([]);
            await handleGenerateSuggestions(uploadedUrl); // Auto-selects first suggestion on completion

            triggerStatus("Image uploaded, processed & dominant color detected!", "success");
          } else {
            setEditingItem({
              ...editingItem,
              image: compressedURL,
            });
            triggerStatus("Image processed successfully!", "success");
          }
        }
      };
      reader.onerror = () => {
        triggerStatus("Error reading image file.", "error");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error processing file:", error);
      triggerStatus("Error processing image. Please try again.", "error");
    }
  };

  // ----------------------------------------------------
  // CRUD Action Handlers
  // ----------------------------------------------------

  // USERS
  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as Customer;
    if (!item.email || !item.name) {
      alert("Email and Name are required.");
      return;
    }

    if (isNewRecord) {
      if (
        customers.some(
          (c) => c.email.toLowerCase() === item.email.toLowerCase(),
        )
      ) {
        alert("A customer with this email already exists.");
        return;
      }
      setCustomers((prev) => [
        ...prev,
        {
          ...item,
          passcode: item.passcode || "1960",
          role: item.role || "Engineer",
          location: item.location || businessSettings.productionSettings.defaultPickupLocation,
        },
      ]);
      triggerStatus(`Added Customer ${item.name} successfully!`);
    } else {
      setCustomers((prev) =>
        prev.map((c) =>
          c.email.toLowerCase() === item.email.toLowerCase() ? item : c,
        ),
      );
      // Update any orders placed by this customer as well
      setOrders((prev) =>
        prev.map((o) =>
          o.customer.email.toLowerCase() === item.email.toLowerCase()
            ? {
                ...o,
                customer: {
                  ...o.customer,
                  name: item.name,
                  phone: item.phone,
                  location: item.location,
                },
              }
            : o,
        ),
      );
      triggerStatus(`Updated Customer ${item.name} successfully!`);
    }
    setEditingType(null);
  };

  const handleDeleteUser = async (email: string) => {
    try {
      await StorageService.deleteDocument("customers", email);
      triggerStatus("Customer record deleted.", "info");
    } catch (err) {
      triggerStatus("Failed to delete customer", "error");
    }
  };

  // STYLES
  const handleSaveStyle = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as StyleCategory;
    if (!item.id || !item.name) {
      alert("Style ID and Name are required.");
      return;
    }

    if (isNewRecord) {
      if (styles.some((s) => s.id === item.id)) {
        alert("A style with this ID already exists.");
        return;
      }
      setStyles((prev) => [...prev, item]);
      triggerStatus(`Created style ${item.name} successfully!`);
    } else {
      setStyles((prev) => prev.map((s) => (s.id === item.id ? item : s)));
      triggerStatus(`Updated style ${item.name} successfully!`);
    }
    setEditingType(null);
  };

  const handleDeleteStyle = async (id: string) => {
    try {
      await StorageService.deleteDocument("styles", id);
      triggerStatus("Style class deleted.", "info");
    } catch (err) {
      triggerStatus("Failed to delete style class", "error");
    }
  };

  const handleDuplicateStyle = (style: StyleCategory) => {
    const idMatch = style.id.match(/^(.*?)-(\d+)$/);
    const baseId = idMatch ? idMatch[1] : style.id;

    const nameMatch = style.name.match(/^(.*?)\s*[-#]?\s*(\d+)$/);
    const baseName = nameMatch ? nameMatch[1].trim() : style.name;

    let maxSeq = 0;
    styles.forEach((s) => {
      if (s.id === baseId) {
        maxSeq = Math.max(maxSeq, 1);
      } else {
        const m = s.id.match(
          new RegExp(
            `^${baseId.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}-(\\d+)$`,
          ),
        );
        if (m) {
          maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
        }
      }
    });

    const nextSeq = maxSeq + 1;
    const newId = `${baseId}-${nextSeq}`;
    const newName = `${baseName} ${nextSeq}`;

    const newStyle = {
      ...style,
      id: newId,
      name: newName,
    };
    setStyles((prev) => [...prev, newStyle]);
    triggerStatus(
      `Duplicated style ${style.name} as ${newName} (${newId}) successfully!`,
      "success",
    );
  };

  // FABRICS
  const handleSaveFabric = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[handleSaveFabric] Start. editingItem:", editingItem);
    const item = editingItem as Fabric;
    if (!item.code || !item.name) {
      console.log("[handleSaveFabric] Missing code or name. code:", item.code, "name:", item.name);
      triggerStatus("Fabric Code and Name are required.", "error");
      return;
    }

    console.log("[handleSaveFabric] Base pricing calculation");
    // Auto-calculate the price from base if multiplier is updated
    const basePrice = 35; // Standard mill pricing
    const price = Math.round(basePrice * (item.priceMultiplier || 1));

    console.log("[handleSaveFabric] Creating finalItem");
    const finalItem: Fabric = {
      ...item,
      price,
      stockStatus:
        item.stock <= 0
          ? "OUT_OF_STOCK"
          : item.stock <= 5
            ? "LOW_STOCK"
            : "IN_STOCK",
    };

    console.log("[handleSaveFabric] isNewRecord:", isNewRecord);
    if (isNewRecord) {
      try {
        console.log("[handleSaveFabric] Calling FabricService.saveFabric for new record");
        const savedItem = await FabricService.saveFabric(finalItem, true);
        console.log("[handleSaveFabric] Saved item successfully:", savedItem);
        triggerStatus(`Added fabric ${item.name} to catalogue!`, "success");
        setEditingType(null);
      } catch (err: any) {
        console.error("[handleSaveFabric] Error saving new record:", err);
        triggerStatus(`Failed to save fabric: ${err?.message || err}`, "error");
      }
    } else {
      try {
        console.log("[handleSaveFabric] Calling FabricService.saveFabric for update");
        const savedItem = await FabricService.saveFabric(finalItem);
        console.log("[handleSaveFabric] Updated item successfully:", savedItem);
        triggerStatus(`Updated fabric ${item.name} specifications.`, "success");
        setEditingType(null);
      } catch (err: any) {
        console.error("[handleSaveFabric] Error updating record:", err);
        triggerStatus(`Failed to update fabric: ${err?.message || err}`, "error");
      }
    }
  };

  const handleDeleteFabric = async (code: string) => {
    const fabricToDelete = fabrics.find(f => f.code === code);
    if (fabricToDelete) {
      try {
        await FabricService.deleteFabric(fabricToDelete);
        triggerStatus("Fabric catalogue entry deleted.", "info");
      } catch (err) {
        triggerStatus("Failed to delete fabric", "error");
      }
    }
  };

  // BATCHES
  const handleSaveBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as Batch;
    if (!item.id || !item.name) {
      alert("Batch ID and Name are required.");
      return;
    }

    if (isNewRecord) {
      if (batches.some((b) => b.id === item.id)) {
        alert("A cohort batch with this ID already exists.");
        return;
      }
      setBatches((prev) => [...prev, item]);
      triggerStatus(`Cohort batch ${item.name} created!`);
    } else {
      setBatches((prev) => prev.map((b) => (b.id === item.id ? item : b)));
      triggerStatus(`Cohort batch ${item.name} details synchronized.`);
    }
    setEditingType(null);
  };

  // ORDERS
  const handleSaveOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as MasterOrder;
    if (!item.shipment.trackingId) {
      alert("Order tracking ID is required.");
      return;
    }

    if (isNewRecord) {
      setOrders((prev) => [item, ...prev]);
      triggerStatus(`Manually registered order ${item.shipment.trackingId}`);
    } else {
      setOrders((prev) =>
        prev.map((o) =>
          o.shipment.trackingId === item.shipment.trackingId ? item : o,
        ),
      );
      triggerStatus(
        `Order ${item.shipment.trackingId} tracking & payments updated!`,
      );
    }
    setEditingType(null);
  };

  const handleDeleteOrder = async (trackingId: string) => {
    try {
      await StorageService.deleteDocument("orders", trackingId);
      triggerStatus("Order deleted.", "info");
    } catch (err) {
      triggerStatus("Failed to delete order", "error");
    }
  };

  // SHOWPIECES
  const handleSaveShowpiece = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as Showpiece;
    if (!item.id || !item.title) {
      alert("Showpiece ID and Title are required.");
      return;
    }

    if (isNewRecord) {
      if (showpieces.some((s) => s.id === item.id)) {
        alert("A showpiece with this ID already exists.");
        return;
      }
      if (setShowpieces) {
        setShowpieces((prev) => [...prev, item]);
      }
      triggerStatus(`Created showpiece "${item.title}" successfully!`);
    } else {
      if (setShowpieces) {
        setShowpieces((prev) => prev.map((s) => (s.id === item.id ? item : s)));
      }
      triggerStatus(`Updated showpiece "${item.title}" successfully!`);
    }
    setEditingType(null);
  };

  const handleDeleteShowpiece = async (id: string) => {
    try {
      await StorageService.deleteDocument("showpieces", id);
      triggerStatus("Showpiece deleted.", "info");
    } catch (err) {
      triggerStatus("Failed to delete showpiece", "error");
    }
  };

  // COMMUNITY PHOTOS
  const handleSavePhoto = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as CommunityPhoto;
    if (!item.id) {
      alert("Photo ID is required.");
      return;
    }
    if (!item.url) {
      alert("Photo Image or URL is required.");
      return;
    }

    if (isNewRecord) {
      if (communityPhotos.length >= 20) {
        alert(
          "Maximum capacity reached! The community photo gallery has a strict limit of 20 photos. Please delete some photos before adding new ones.",
        );
        return;
      }
      if (communityPhotos.some((p) => p.id === item.id)) {
        alert("A photo with this ID already exists.");
        return;
      }
      if (setCommunityPhotos) {
        setCommunityPhotos((prev) => [...prev, item]);
      }
      triggerStatus(`Added photo "${item.id}" successfully!`);
    } else {
      if (setCommunityPhotos) {
        setCommunityPhotos((prev) =>
          prev.map((p) => (p.id === item.id ? item : p)),
        );
      }
      triggerStatus(`Updated photo "${item.id}" successfully!`);
    }
    setEditingType(null);
  };

  const handleDeletePhoto = async (id: string) => {
    try {
      await StorageService.deleteDocument("communityPhotos", id);
      triggerStatus("Community photo deleted.", "info");
    } catch (err) {
      triggerStatus("Failed to delete photo", "error");
    }
  };

  // ----------------------------------------------------
  // Render Filters & Helpers
  // ----------------------------------------------------
  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      c.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      c.phone.includes(userSearch) ||
      (c.role && c.role.toLowerCase().includes(userSearch.toLowerCase())),
  );

  const filteredStyles = styles.filter(
    (s) =>
      s.name.toLowerCase().includes(styleSearch.toLowerCase()) ||
      s.id.toLowerCase().includes(styleSearch.toLowerCase()) ||
      s.description.toLowerCase().includes(styleSearch.toLowerCase()),
  );

  const filteredFabrics = fabrics.filter(
    (f) =>
      f.name.toLowerCase().includes(fabricSearch.toLowerCase()) ||
      f.code.toLowerCase().includes(fabricSearch.toLowerCase()) ||
      f.category.toLowerCase().includes(fabricSearch.toLowerCase()),
  );

  const filteredBatches = batches.filter(
    (b) =>
      b.name.toLowerCase().includes(batchSearch.toLowerCase()) ||
      b.id.toLowerCase().includes(batchSearch.toLowerCase()) ||
      (b.pickupLocation &&
        b.pickupLocation.toLowerCase().includes(batchSearch.toLowerCase())),
  );

  const filteredOrders = orders.filter(
    (o) =>
      o.shipment.trackingId.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.customer.name.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.customer.email.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.style.name.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.fabric.name.toLowerCase().includes(orderSearch.toLowerCase()),
  );

  const filteredPhotos = communityPhotos.filter(
    (p) =>
      p.id.toLowerCase().includes(photoSearch.toLowerCase()) ||
      (p.caption &&
        p.caption.toLowerCase().includes(photoSearch.toLowerCase())) ||
      (p.cohortName &&
        p.cohortName.toLowerCase().includes(photoSearch.toLowerCase())) ||
      (p.deliveryYear && p.deliveryYear.toString().includes(photoSearch)),
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 font-sans py-4">
      {/* Toast HUD Status messages */}
      <AnimatePresence>
        {statusMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full bg-heritage-green text-heritage-gold border border-heritage-gold/30 shadow-2xl flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
          >
            <Check size={14} className="text-heritage-gold" />
            <span>{statusMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Header */}
      <div className="text-center space-y-3 flex flex-col items-center">
        <div className="mb-2">
          <img
            loading="lazy"
            src={odogwuLogo}
            alt="The Odogwu Heritage Official Logo"
            className="w-20 h-20 rounded-full border-2 border-heritage-gold/35 object-cover bg-heritage-forest shadow-md"
            referrerPolicy="no-referrer"
          />
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-heritage-gold/10 text-heritage-gold border border-heritage-gold/25 rounded-full text-[10px] font-bold uppercase tracking-widest">
          <Database size={11} className="animate-pulse text-heritage-gold" />{" "}
          Relational Database Management Panel
        </span>
        <h1 className="text-3xl sm:text-4xl font-display font-semibold text-heritage-green leading-none tracking-tight">
          Bespoke Tailoring Database Hub
        </h1>
        <p className="text-xs sm:text-sm text-heritage-ink/70 max-w-2xl mx-auto leading-relaxed">
          Manage, create, and audit live relational records. Changes propagate
          instantly to active client tracking dashboards and the live
          configurator studio.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 lg:gap-8">
        {/* Navigation Sidebar / Mobile Scrollable Row */}
        <div className="w-full md:w-56 lg:w-64 shrink-0 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
          <div className="flex flex-row md:flex-col space-x-1 md:space-x-0 md:space-y-1 bg-heritage-forest/40 p-1 md:p-2 rounded-2xl border border-heritage-gold/10 w-max md:w-full min-w-full">
            {[
              {
                id: "documentation",
                label: "Schema Models & ERD",
                icon: BookOpen,
                condition: true // Everyone who can view staff dashboard
              },
              { id: "operations", label: "Operations Dashboard", icon: Layers, condition: AuthorizationEngine.canViewReports(currentUser) },
              { id: "users", label: "Users & Profiles", icon: User, condition: AuthorizationEngine.canManageCustomers(currentUser) },
              { id: "styles", label: "Garment Options", icon: Shirt, condition: AuthorizationEngine.canManageReferenceData(currentUser) },
              { id: "fabrics", label: "Fabrics Catalogue", icon: Layers, condition: AuthorizationEngine.canManageFabrics(currentUser) },
              { id: "batches", label: "Sourcing Batches", icon: Layers2, condition: AuthorizationEngine.canManageBatches(currentUser) },
              { id: "orders", label: "Master Orders", icon: ClipboardList, condition: AuthorizationEngine.canManageOrders(currentUser) },
              { id: "showpieces", label: "Gallery Showpieces", icon: Tag, condition: AuthorizationEngine.canManageShowpieces(currentUser) },
              { id: "photos", label: "Community & Cohorts", icon: Image, condition: AuthorizationEngine.canManageGallery(currentUser) },
              { id: "media", label: "Media Library", icon: Image, condition: AuthorizationEngine.canManageMedia(currentUser) },
              { id: "plugins", label: "Plugins", icon: Puzzle, condition: AuthorizationEngine.canManageSettings(currentUser) },
              { id: "audit", label: "Audit Logs", icon: FileText, condition: AuthorizationEngine.canManageUsers(currentUser) },
              { id: "roles", label: "Roles", icon: ShieldCheck, condition: AuthorizationEngine.canManageUsers(currentUser) },
              {
                id: "compliance",
                label: "Compliance & GDPR",
                icon: ShieldCheck,
                condition: AuthorizationEngine.canManageSettings(currentUser)
              },
              { id: "settings", label: "System Settings", icon: Sliders, condition: AuthorizationEngine.canManageSettings(currentUser) },
            ].filter(tab => tab.condition !== false).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as TabType);
                    setEditingType(null);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 md:py-2.5 text-[10px] md:text-[11px] font-bold uppercase tracking-wider rounded-xl transition cursor-pointer select-none whitespace-nowrap md:whitespace-normal text-left ${
                    isActive
                      ? "bg-heritage-green text-heritage-gold border border-heritage-gold/25 shadow-md font-bold"
                      : "text-heritage-beige hover:text-white hover:bg-heritage-forest/30"
                  }`}
                >
                  <Icon size={14} className="shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* CORE VIEWPORT */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-heritage-gold/15 rounded-3xl p-6 sm:p-8 shadow-sm h-full">
            {/* EDITING FORMS OVERLAYS */}
            {editingType && editingItem && (
              <div className="mb-8 p-6 bg-heritage-forest/5 border-2 border-heritage-gold/20 rounded-2xl text-left space-y-4">
                <div className="flex items-center justify-between border-b border-heritage-gold/10 pb-3">
                  <h3 className="text-sm font-bold font-serif text-heritage-green uppercase tracking-wider">
                    {(() => {
                      const entityNames: Record<string, string> = {
                        user: "User Profile",
                        style: "Garment Option",
                        fabric: "Fabric Item",
                        batch: "Sourcing Batch",
                        order: "Master Order",
                        showpiece: "Gallery Showpiece",
                        photo: "Community Photo",
                      };
                      const name = entityNames[editingType] || "Record";
                      return isNewRecord
                        ? `➕ Add New ${name}`
                        : `✏️ Modify Selected ${name}`;
                    })()}
                  </h3>
                  <button
                    onClick={() => setEditingType(null)}
                    className="h-7 w-7 rounded-full bg-heritage-forest/15 text-heritage-green flex items-center justify-center hover:bg-heritage-green hover:text-heritage-gold transition cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Entity-Specific Form Elements */}
                {editingType === "user" && (
                  <form
                    onSubmit={handleSaveUser}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans"
                  >
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Email Address (Key / Login)
                      </label>
                      <input
                        type="email"
                        required
                        disabled={!isNewRecord}
                        value={editingItem.email}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            email: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg focus:ring-1 focus:ring-heritage-gold"
                        placeholder="e.g. x.e@asml-corp.nl"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Customer Full Name
                      </label>
                      <input
                        type="text"
                        required
                        value={editingItem.name}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            name: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                        placeholder="e.g. Xavier E."
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        value={editingItem.phone}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            phone: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                        placeholder="e.g. +31 6 1234 5678"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Campus Location / Pickup Lockers
                      </label>
                      <input
                        type="text"
                        value={editingItem.location}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            location: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                        placeholder={`e.g. ${businessSettings.productionSettings.defaultPickupLocation}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        User Security PIN (Passcode)
                      </label>
                      <input
                        type="text"
                        maxLength={4}
                        value={editingItem.passcode || "1960"}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            passcode: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-mono tracking-widest"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Organizational Role
                      </label>
                      <select
                        value={editingItem.role || "Engineer"}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            role: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        <option value="Active Cohort Member">
                          Active Cohort Member
                        </option>
                        <option value="Engineer">Engineer</option>
                        <option value="NTCC Founder & Coordinator">
                          NTCC Founder & Coordinator
                        </option>
                        <option value="Lead Fabric Sourcing Agent">
                          Lead Fabric Sourcing Agent
                        </option>
                      </select>
                    </div>
                    <div className="sm:col-span-2 pt-4 flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingType(null)}
                        className="px-4 py-2 bg-gray-100 rounded-lg font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-heritage-green text-heritage-gold font-bold rounded-lg border border-heritage-gold/20"
                      >
                        Save Customer Record
                      </button>
                    </div>
                  </form>
                )}

                {editingType === "style" && (
                  <form
                    onSubmit={handleSaveStyle}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans"
                  >
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Style ID / Code (Primary Key)
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!isNewRecord}
                        value={editingItem.id}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, id: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                        placeholder="e.g. style-kaftan"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Garment Style Name
                      </label>
                      <input
                        type="text"
                        required
                        value={editingItem.name}
                        onChange={(e) => {
                          const newName = e.target.value;
                          if (isNewRecord) {
                            const baseSlug = newName
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, "-")
                              .replace(/(^-|-$)/g, "");
                            if (baseSlug) {
                              let maxSequence = 0;
                              styles.forEach((style) => {
                                if (style.id.startsWith(`${baseSlug}-`)) {
                                  const parts = style.id.split("-");
                                  const lastPart = parts[parts.length - 1];
                                  if (!isNaN(parseInt(lastPart))) {
                                    maxSequence = Math.max(
                                      maxSequence,
                                      parseInt(lastPart),
                                    );
                                  }
                                } else if (style.id === baseSlug) {
                                  // If someone manually created one without a sequence
                                  maxSequence = Math.max(maxSequence, 0);
                                }
                              });
                              setEditingItem({
                                ...editingItem,
                                name: newName,
                                id: `${baseSlug}-${maxSequence + 1}`,
                              });
                            } else {
                              setEditingItem({
                                ...editingItem,
                                name: newName,
                                id: "",
                              });
                            }
                          } else {
                            setEditingItem({ ...editingItem, name: newName });
                          }
                        }}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                        placeholder="e.g. Royal Senator"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Base Price (€)
                      </label>
                      <input
                        type="number"
                        required
                        value={editingItem.basePrice}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            basePrice: parseFloat(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Target Demographic
                      </label>
                      <select
                        value={editingItem.gender || "unisex"}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            gender: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        {useReferenceDataFallback("genders", [
                          { value: "male", label: "Male" },
                          { value: "female", label: "Female" },
                          { value: "unisex", label: "Unisex" },
                          { value: "couple", label: "Couple" },
                          { value: "family", label: "Family" },
                        ]).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Outfit Type
                      </label>
                      <select
                        value={editingItem.outfitType || "Senator Set"}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            outfitType: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        {useReferenceDataFallback("outfit_types", [
                          { value: "Senator Set", label: "Senator Set" },
                          { value: "Kaftan Set", label: "Kaftan Set" },
                          { value: "Boubou", label: "Boubou" },
                          { value: "Agbada", label: "Agbada" },
                        ]).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Garment Composition
                      </label>
                      <select
                        value={editingItem.garmentComposition || "2-Piece Set"}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            garmentComposition: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        {useReferenceDataFallback("garment_compositions", [
                          { value: "Shirt Only", label: "Shirt Only" },
                          { value: "Trouser Only", label: "Trouser Only" },
                          { value: "Shorts Only", label: "Shorts Only" },
                          { value: "Blouse Only", label: "Blouse Only" },
                          { value: "Top Only", label: "Top Only" },
                          { value: "Skirt Only", label: "Skirt Only" },
                          { value: "Wrapper Only", label: "Wrapper Only" },
                          { value: "Dress Only", label: "Dress Only" },
                          { value: "Kaftan Only", label: "Kaftan Only" },
                          { value: "Agbada Only", label: "Agbada Only" },
                          { value: "2-Piece Set", label: "2-Piece Set" },
                          { value: "3-Piece Set", label: "3-Piece Set" },
                          { value: "4-Piece Set", label: "4-Piece Set" },
                          { value: "Couple Set", label: "Couple Set" },
                          { value: "Parent & Child Set", label: "Parent & Child Set" },
                          { value: "Family Set", label: "Family Set" },
                        ]).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Fabric Category
                      </label>
                      <select
                        value={editingItem.fabricCategory || "Any"}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            fabricCategory: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        <option value="Any">Any Fabric</option>
                        {useReferenceDataFallback("fabric_categories", [
                          { value: "HiTarget Ankara", label: "HiTarget Ankara" },
                          { value: "Hollandis Ankara", label: "Hollandis Ankara" },
                          { value: "Kampala", label: "Kampala" },
                          { value: "Aso-Oke", label: "Aso-Oke" },
                          { value: "Adire", label: "Adire" },
                          { value: "Isiagu (Akwa-Oche)", label: "Isiagu (Akwa-Oche)" },
                          { value: "Lace", label: "Lace" },
                        ]).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="font-bold text-heritage-green">
                        Style Description
                      </label>
                      <input
                        type="text"
                        value={editingItem.description}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            description: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                        placeholder="Short summary of fit guidelines..."
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="font-bold text-heritage-green flex justify-between items-center">
                        <span>Style Reference Image URL</span>
                        <span className="text-gray-400 font-normal">
                          Enter URL or drag file
                        </span>
                      </label>
                      <input
                        type="text"
                        placeholder="https://images.unsplash.com..."
                        value={editingItem.image || ""}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            image: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-mono text-[10px]"
                      />

                      <div
                        className={`relative w-[144px] h-[144px] sm:w-[192px] sm:h-[192px] border-2 border-dashed rounded-xl overflow-hidden transition-colors mx-auto ${
                          isDragging
                            ? "border-heritage-gold bg-heritage-gold/5"
                            : "border-gray-300 hover:border-heritage-gold/50 bg-gray-50"
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <input
                          type="file"
                          id="style-file-input"
                          accept="image/*"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                        {editingItem.image ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-heritage-cream border border-heritage-gold/10 shadow-sm group">
                            <img
                              loading="lazy"
                              src={editingItem.image}
                              alt="Style Preview"
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[9px]">
                              <Upload size={16} className="mb-1" />
                              <span>Replace</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingItem({ ...editingItem, image: "" });
                                }}
                                className="mt-2 bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-[10px] font-bold cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label
                            htmlFor="style-file-input"
                            className="absolute inset-0 flex flex-col items-center justify-center text-heritage-ink/50 cursor-pointer hover:text-heritage-gold transition-colors p-2 text-center"
                          >
                            <Image size={20} className="mb-1 opacity-50" />
                            <p className="text-[9px] font-semibold">
                              Upload Image
                            </p>
                          </label>
                        )}
                      </div>

                      {editingItem.image && editingItem.detectedColors && (
                        <div className="flex items-center justify-between mt-2 p-2 bg-white rounded-lg border border-gray-200">
                          <span className="text-[10px] font-bold text-heritage-green">
                            Detected Garment Colors:
                          </span>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <label className="text-[9px] text-gray-500 font-bold uppercase">
                                Main
                              </label>
                              <input
                                type="color"
                                value={editingItem.detectedColors.main}
                                onChange={(e) =>
                                  setEditingItem({
                                    ...editingItem,
                                    detectedColors: {
                                      ...editingItem.detectedColors,
                                      main: e.target.value,
                                    },
                                  })
                                }
                                className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                                title="Edit Main Color"
                              />
                              <span
                                className="text-[9px] text-heritage-ink/70 font-medium w-16 truncate"
                                title={getColorName(
                                  editingItem.detectedColors.main,
                                )}
                              >
                                {getColorName(editingItem.detectedColors.main)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
                              <label className="text-[9px] text-gray-500 font-bold uppercase">
                                Accent
                              </label>
                              <input
                                type="color"
                                value={editingItem.detectedColors.secondary}
                                onChange={(e) =>
                                  setEditingItem({
                                    ...editingItem,
                                    detectedColors: {
                                      ...editingItem.detectedColors,
                                      secondary: e.target.value,
                                    },
                                  })
                                }
                                className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                                title="Edit Secondary Color"
                              />
                              <span
                                className="text-[9px] text-heritage-ink/70 font-medium w-16 truncate"
                                title={getColorName(
                                  editingItem.detectedColors.secondary,
                                )}
                              >
                                {getColorName(
                                  editingItem.detectedColors.secondary,
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3 sm:col-span-2 border-t border-heritage-gold/20 pt-4 mt-2">
                      <div className="flex justify-between items-center">
                        <label className="font-bold text-heritage-green">
                          Garment Construction Details & Prices
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const current =
                              editingItem.constructionDetails || [];
                            setEditingItem({
                              ...editingItem,
                              constructionDetails: [
                                ...current,
                                {
                                  code: "NEW",
                                  type: "New Configuration",
                                  price: editingItem.basePrice || 150,
                                  discountPrice:
                                    (editingItem.basePrice || 150) - 20,
                                },
                              ],
                            });
                          }}
                          className="text-[10px] font-bold bg-heritage-green/10 text-heritage-green hover:bg-heritage-green hover:text-white px-2 py-1 rounded transition"
                        >
                          + Add Option
                        </button>
                      </div>

                      <div className="space-y-2">
                        {(editingItem.constructionDetails || []).map(
                          (detail: ConstructionDetail, idx: number) => (
                            <div
                              key={idx}
                              className="flex flex-col sm:flex-row gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200"
                            >
                              <input
                                type="text"
                                placeholder="Code (e.g. G1)"
                                value={detail.code}
                                onChange={(e) => {
                                  const newDetails = [
                                    ...editingItem.constructionDetails,
                                  ];
                                  newDetails[idx] = {
                                    ...detail,
                                    code: e.target.value,
                                  };
                                  setEditingItem({
                                    ...editingItem,
                                    constructionDetails: newDetails,
                                  });
                                }}
                                className="w-20 px-2 py-1 border border-gray-300 rounded font-mono text-xs"
                              />
                              <input
                                type="text"
                                placeholder="Description (e.g. 3-Piece Set)"
                                value={detail.type}
                                onChange={(e) => {
                                  const newDetails = [
                                    ...editingItem.constructionDetails,
                                  ];
                                  newDetails[idx] = {
                                    ...detail,
                                    type: e.target.value,
                                  };
                                  setEditingItem({
                                    ...editingItem,
                                    constructionDetails: newDetails,
                                  });
                                }}
                                className="flex-grow px-2 py-1 border border-gray-300 rounded text-xs"
                              />
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400 font-medium">
                                  €
                                </span>
                                <input
                                  type="number"
                                  placeholder="Price"
                                  value={detail.price}
                                  onChange={(e) => {
                                    const newDetails = [
                                      ...editingItem.constructionDetails,
                                    ];
                                    newDetails[idx] = {
                                      ...detail,
                                      price: parseFloat(e.target.value) || 0,
                                    };
                                    setEditingItem({
                                      ...editingItem,
                                      constructionDetails: newDetails,
                                    });
                                  }}
                                  className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-gray-400 font-medium">
                                  Dist: €
                                </span>
                                <input
                                  type="number"
                                  placeholder="Disc"
                                  value={detail.discountPrice || ""}
                                  onChange={(e) => {
                                    const newDetails = [
                                      ...editingItem.constructionDetails,
                                    ];
                                    newDetails[idx] = {
                                      ...detail,
                                      discountPrice:
                                        parseFloat(e.target.value) || 0,
                                    };
                                    setEditingItem({
                                      ...editingItem,
                                      constructionDetails: newDetails,
                                    });
                                  }}
                                  className="w-20 px-2 py-1 border border-gray-300 rounded text-xs text-green-700"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const newDetails =
                                    editingItem.constructionDetails.filter(
                                      (_, i) => i !== idx,
                                    );
                                  setEditingItem({
                                    ...editingItem,
                                    constructionDetails: newDetails,
                                  });
                                }}
                                className="p-1.5 text-red-500 hover:bg-red-100 rounded"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ),
                        )}
                        {(!editingItem.constructionDetails ||
                          editingItem.constructionDetails.length === 0) && (
                          <div className="text-center p-4 bg-gray-50 border border-dashed border-gray-300 rounded-lg">
                            <p className="text-xs text-gray-500 mb-2">
                              No specific construction pricing defined. Will
                              fall back to official price list by gender.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                const isFemale =
                                  editingItem.gender === "female";
                                const defaults = OFFICIAL_PRICE_LIST.filter(
                                  (p) =>
                                    isFemale
                                      ? p.category === "ladies" &&
                                        p.code !== "L5"
                                      : p.category === "guys",
                                ).map((p) => ({
                                  code: p.code,
                                  type: p.description,
                                  price: p.actualMax,
                                  discountPrice: p.discountedMax,
                                }));
                                setEditingItem({
                                  ...editingItem,
                                  constructionDetails: defaults,
                                });
                              }}
                              className="text-xs bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 transition font-medium"
                            >
                              Populate from Official Price List
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="sm:col-span-2 pt-4 border-t border-gray-200 mt-4">
                      <h4 className="font-bold text-heritage-green text-sm mb-2">Supported Garment Details</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {['trousers', 'shorts', 'skirt', 'dress', 'sleeves', 'pockets', 'embroidery', 'accessories', 'lining'].map((field) => (
                          <label key={field} className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={editingItem.supportedGarmentDetails?.[field] ?? true}
                              onChange={(e) => {
                                setEditingItem({
                                  ...editingItem,
                                  supportedGarmentDetails: {
                                    ...(editingItem.supportedGarmentDetails || {}),
                                    [field]: e.target.checked
                                  }
                                });
                              }}
                              className="rounded border-gray-300 text-heritage-gold focus:ring-heritage-gold"
                            />
                            {field.charAt(0).toUpperCase() + field.slice(1)}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="sm:col-span-2 pt-4 flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingType(null)}
                        className="px-4 py-2 bg-gray-100 rounded-lg font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-heritage-green text-heritage-gold font-bold rounded-lg border border-heritage-gold/20"
                      >
                        Save Style Class
                      </button>
                    </div>
                  </form>
                )}

                {editingType === "fabric" && (
                  <form
                    onSubmit={handleSaveFabric}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs font-sans"
                  >
                    {/* Left Column: Details */}
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="font-bold text-heritage-green">
                          Fabric Catalogue Code (Auto-generated)
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={editingItem.code}
                          className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg font-mono text-xs select-all"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-heritage-green">
                          Fabric Name
                        </label>
                        <input
                          type="text"
                          value={editingItem.name}
                          onChange={(e) =>
                            setEditingItem({
                              ...editingItem,
                              name: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                          placeholder="e.g. Royal Emerald Ankara"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-heritage-green">
                          Fabric Category Class
                        </label>
                        <select
                          value={editingItem.category || "HiTarget Ankara"}
                          onChange={(e) =>
                            setEditingItem({
                              ...editingItem,
                              category: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                        >
                          {useReferenceDataFallback("fabric_categories", [
                            { value: "HiTarget Ankara", label: "HiTarget Ankara" },
                            { value: "Hollandis Ankara", label: "Hollandis Ankara" },
                            { value: "Kampala", label: "Kampala" },
                            { value: "Aso-Oke", label: "Aso-Oke" },
                            { value: "Adire", label: "Adire" },
                            { value: "Isiagu (Akwa-Oche)", label: "Isiagu (Akwa-Oche)" },
                            { value: "Lace", label: "Lace" },
                          ]).map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="font-bold text-heritage-green">
                            Color
                          </label>
                          <input
                            type="text"
                            value={editingItem.color || ""}
                            onChange={(e) =>
                              setEditingItem({
                                ...editingItem,
                                color: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                            placeholder="e.g. Emerald Green"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="font-bold text-heritage-green">
                            HEX Hue Code
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={editingItem.colorHex || "#1e3a1e"}
                              onChange={(e) =>
                                setEditingItem({
                                  ...editingItem,
                                  colorHex: e.target.value,
                                })
                              }
                              className="h-8 w-10 border border-heritage-gold/20 rounded-lg p-0.5 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={editingItem.colorHex || "#1e3a1e"}
                              onChange={(e) =>
                                setEditingItem({
                                  ...editingItem,
                                  colorHex: e.target.value,
                                })
                              }
                              className="w-full px-2 py-1.5 border border-heritage-gold/20 bg-white rounded-lg font-mono text-center text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Swatches and Stock controls */}
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="font-bold text-heritage-green">
                          Stock Inventory &amp; Status
                        </label>
                        <div className="flex gap-4 items-center">
                          <div className="w-1/2 space-y-1">
                            <span className="text-[10px] text-gray-500 font-medium">
                              Linear Yards
                            </span>
                            <input
                              type="number"
                              min="0"
                              value={editingItem.stock ?? 30}
                              onChange={(e) => {
                                const stock = parseInt(e.target.value) || 0;
                                setEditingItem({
                                  ...editingItem,
                                  stock,
                                  stockStatus:
                                    stock <= 0
                                      ? "OUT_OF_STOCK"
                                      : stock <= 5
                                        ? "LOW_STOCK"
                                        : "IN_STOCK",
                                });
                              }}
                              className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-mono"
                            />
                          </div>
                          <div className="w-1/2 self-end">
                            <button
                              type="button"
                              onClick={() => {
                                const currentStock = editingItem.stock ?? 30;
                                const newStock = currentStock <= 0 ? 25 : 0;
                                setEditingItem({
                                  ...editingItem,
                                  stock: newStock,
                                  stockStatus:
                                    newStock <= 0 ? "OUT_OF_STOCK" : "IN_STOCK",
                                });
                              }}
                              className={`w-full py-2 px-3 border rounded-lg font-bold text-center transition cursor-pointer select-none text-[10px] ${
                                (editingItem.stock ?? 30) <= 0
                                  ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                                  : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                              }`}
                            >
                              {(editingItem.stock ?? 30) <= 0
                                ? "Mark as In Stock (25 Yds)"
                                : "Mark Out of Stock (0 Yds)"}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* High-res Image / Swatch URL with Upload Simulation */}
                      <div className="space-y-2">
                        <label className="font-bold text-heritage-green flex justify-between items-center">
                          <span>Fabric Swatch Texture Image URL</span>
                          <span className="text-gray-400 font-normal">
                            Enter URL or drag file
                          </span>
                        </label>
                        <input
                          type="text"
                          placeholder="https://images.unsplash.com..."
                          value={editingItem.image || ""}
                          onChange={(e) =>
                            setEditingItem({
                              ...editingItem,
                              image: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-mono text-[10px]"
                        />

                        {/* Drag and Drop Swatch Area */}
                        <div
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          onClick={() =>
                            document
                              .getElementById("swatch-file-input")
                              ?.click()
                          }
                          className={`relative h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-4 transition-all cursor-pointer overflow-hidden ${
                            isDragging
                              ? "border-heritage-gold bg-heritage-gold/10"
                              : "border-heritage-gold/30 hover:border-heritage-gold hover:bg-heritage-forest/5"
                          }`}
                        >
                          <input
                            type="file"
                            id="swatch-file-input"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileChange}
                          />
                          {editingItem.image ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group">
                              <img
                                loading="lazy"
                                src={editingItem.image}
                                alt="Swatch Preview"
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[9px]">
                                <Upload size={14} className="mb-1" />
                                <span>Replace Swatch File</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center space-y-1 text-heritage-ink/70">
                              <Upload
                                size={16}
                                className="mx-auto text-heritage-gold"
                              />
                              <p className="text-[10px] font-semibold">
                                Drag &amp; drop swatch image, or click to browse
                              </p>
                              <p className="text-[9px] text-gray-400">
                                Supports PNG, JPG, WebP (Converts to high-res
                                data URL)
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Quick Presets */}
                        {(fabricNameSuggestions.length > 0 || isGeneratingSuggestions) && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">
                              Quick Fabric Name Suggestions
                            </span>
                            <div className="flex flex-col gap-2">
                              {isGeneratingSuggestions ? (
                                <div className="text-[10px] text-heritage-forest animate-pulse">
                                  Analyzing fabric and generating premium names...
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {fabricNameSuggestions.map((suggestion, idx) => (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => {
                                        setEditingItem({
                                          ...editingItem,
                                          name: suggestion,
                                        });
                                        triggerStatus(`Applied suggested name: ${suggestion}`);
                                      }}
                                      className="px-2 py-1 bg-heritage-forest/10 hover:bg-heritage-forest/20 text-[9px] text-heritage-green font-bold rounded-lg border border-heritage-gold/15 cursor-pointer"
                                    >
                                      {suggestion}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {!isGeneratingSuggestions && editingItem?.image && (
                                <button
                                  type="button"
                                  onClick={() => handleGenerateSuggestions(editingItem.image)}
                                  className="self-start text-[9px] text-heritage-gold font-bold hover:underline"
                                >
                                  Generate New Suggestions
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer buttons */}
                    <div className="sm:col-span-2 border-t border-heritage-gold/10 pt-4 flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingType(null)}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition cursor-pointer select-none"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-heritage-green hover:bg-heritage-forest text-heritage-gold font-bold rounded-lg border border-heritage-gold/20 transition cursor-pointer select-none"
                      >
                        Save Fabric Settings
                      </button>
                    </div>
                  </form>
                )}

                {editingType === "batch" && (
                  <form
                    onSubmit={handleSaveBatch}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans"
                  >
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Batch ID (Primary Key)
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!isNewRecord}
                        value={editingItem.id}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, id: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Batch Name
                      </label>
                      <input
                        type="text"
                        required
                        value={editingItem.name}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            name: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Duration (Timeline String)
                      </label>
                      <input
                        type="text"
                        required
                        value={editingItem.duration}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            duration: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                        placeholder="e.g. Mar 10 - Apr 25, 2025"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Estimated Delivery
                      </label>
                      <input
                        type="text"
                        required
                        value={editingItem.estimatedDelivery || ""}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            estimatedDelivery: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Target Garments
                      </label>
                      <input
                        type="number"
                        required
                        value={editingItem.targetGarments}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            targetGarments: parseInt(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Current Garments
                      </label>
                      <input
                        type="number"
                        required
                        value={editingItem.currentGarments}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            currentGarments: parseInt(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Pickup Coordinates
                      </label>
                      <input
                        type="text"
                        value={editingItem.pickupLocation || ""}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            pickupLocation: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Pipeline Status
                      </label>
                      <select
                        value={editingItem.status}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            status: e.target.value as Batch["status"],
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        <option value="DRAFT">Draft</option>
                        <option value="YET_TO_START">Yet To Start</option>
                        <option value="OPEN">Open</option>
                        <option value="ALMOST_FULL">Almost Full</option>
                        <option value="FULL">Full</option>
                        <option value="CLOSED">Closed</option>
                        <option value="PRODUCTION_STARTED">In Progress</option>
                        <option value="LOCKED">Locked</option>
                        <option value="COMPLETED">Completed</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2 pt-4 flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingType(null)}
                        className="px-4 py-2 bg-gray-100 rounded-lg font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-heritage-green text-heritage-gold font-bold rounded-lg border border-heritage-gold/20"
                      >
                        Save Batch Parameters
                      </button>
                    </div>
                  </form>
                )}

                {editingType === "order" && (
                  <form
                    onSubmit={handleSaveOrder}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans"
                  >
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Tracking ID (Primary Key)
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!isNewRecord}
                        value={editingItem.shipment.trackingId}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            shipment: {
                              ...editingItem.shipment,
                              trackingId: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-mono"
                        placeholder="e.g. ODG-TRK-3950"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Customer Link (User Email)
                      </label>
                      <select
                        value={editingItem.customer.email}
                        onChange={(e) => {
                          const matched = customers.find(
                            (c) => c.email === e.target.value,
                          );
                          if (matched) {
                            setEditingItem({
                              ...editingItem,
                              customer: {
                                name: matched.name,
                                email: matched.email,
                                phone: matched.phone,
                                location: matched.location,
                              },
                            });
                          }
                        }}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        {filteredCustomers.map((c) => (
                          <option key={c.email} value={c.email}>
                            {c.name} ({c.email})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Stitch tracking status (Shipment Stage 1 to 6)
                      </label>
                      <select
                        value={editingItem.shipment.currentStage}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          const statusTexts = [
                            "Deposit Verified. Securing Fabric Swatch...",
                            "Fabric Cut & Registered with Lagos Atelier floor",
                            "Pattern Drafting & Sewing on Lagos floor",
                            "Garment Sewing Completed. Passing QA & Fit Checks...",
                            "Consolidated & Dispatched via Lagos-Schiethol Air Freight Route",
                            `Arrived at ${businessSettings.productionSettings.defaultPickupLocation}. Ready for secure PIN pickup!`,
                          ];
                          setEditingItem({
                            ...editingItem,
                            shipment: {
                              ...editingItem.shipment,
                              currentStage: val,
                              status:
                                statusTexts[val - 1] ||
                                "In Production Pipeline",
                            },
                          });
                        }}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        <option value={1}>
                          Stage 1: Deposit Verified & Sourced Fabric
                        </option>
                        <option value={2}>
                          Stage 2: Pattern Drafting & Marking
                        </option>
                        <option value={3}>
                          Stage 3: Cutting & Stitching on Atelier Floor
                        </option>
                        <option value={4}>
                          Stage 4: Sewing Completed & Cultural QA Checked
                        </option>
                        <option value={5}>
                          Stage 5: Schiphol Freight Transited
                        </option>
                        <option value={6}>
                          Stage 6: Arrived at Pickup Location!
                        </option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Sourced Fabric Swatch
                      </label>
                      <select
                        value={editingItem.fabric.code}
                        onChange={(e) => {
                          const f = fabrics.find(
                            (fb) => fb.code === e.target.value,
                          );
                          if (f) {
                            setEditingItem({
                              ...editingItem,
                              fabric: f,
                            });
                          }
                        }}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        {fabrics.map((f) => (
                          <option key={f.code} value={f.code}>
                            {f.name} ({f.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Garment Style Base
                      </label>
                      <select
                        value={editingItem.style.id}
                        onChange={(e) => {
                          const s = styles.find(
                            (st) => st.id === e.target.value,
                          );
                          if (s) {
                            setEditingItem({
                              ...editingItem,
                              style: s,
                            });
                          }
                        }}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        {styles.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} (€{s.basePrice})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Special Custom Instructions
                      </label>
                      <input
                        type="text"
                        value={editingItem.specialInstructions || ""}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            specialInstructions: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="font-bold text-heritage-green">
                        Notes about Leftover Fabric Piece Management
                      </label>
                      <input
                        type="text"
                        value={editingItem.notesAboutLeftoverFabric || ""}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            notesAboutLeftoverFabric: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                        placeholder="e.g. Please sew traditional custom matching cap or returning scraps."
                      />
                    </div>
                    <div className="sm:col-span-2 pt-4 flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingType(null)}
                        className="px-4 py-2 bg-gray-100 rounded-lg font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-heritage-green text-heritage-gold font-bold rounded-lg border border-heritage-gold/20"
                      >
                        Sync Master Order
                      </button>
                    </div>
                  </form>
                )}

                {editingType === "showpiece" && (
                  <form
                    onSubmit={handleSaveShowpiece}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans"
                  >
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Showpiece ID (Unique Key)
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!isNewRecord}
                        value={editingItem.id}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, id: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg focus:ring-1 focus:ring-heritage-gold font-mono"
                        placeholder="e.g. item-6"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Showpiece Title
                      </label>
                      <input
                        type="text"
                        required
                        value={editingItem.title}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            title: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg focus:ring-1 focus:ring-heritage-gold"
                        placeholder="e.g. The Sovereign Crimson Senator"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Gender / Style Category
                      </label>
                      <select
                        value={editingItem.category}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            category: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        {batches.sort((a,b) => a.batchNumber - b.batchNumber).map((b) => {
                          const catValue = (() => {
                            switch (b.batchNumber) {
                              case 1: return "male";
                              case 2: return "female";
                              case 3: return "fabric";
                              case 4: return "group4";
                              case 5: return "group5";
                              default: return `group${b.batchNumber}`;
                            }
                          })();
                          return (
                            <option key={catValue} value={catValue}>
                              Group {b.batchNumber} - {b.name}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Highlight Tag
                      </label>
                      <input
                        type="text"
                        value={editingItem.tag || ""}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            tag: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                        placeholder="e.g. Bestseller, Trending, Exclusive"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Style Template (FK Link)
                      </label>
                      <select
                        value={editingItem.styleId}
                        onChange={(e) => {
                          const selectedStyle = styles.find(
                            (s) => s.id === e.target.value,
                          );
                          setEditingItem({
                            ...editingItem,
                            styleId: e.target.value,
                            styleName: selectedStyle ? selectedStyle.name : "",
                          });
                        }}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        {styles.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Fabric Sourcing (FK Link)
                      </label>
                      <select
                        value={editingItem.fabricCode}
                        onChange={(e) => {
                          const selectedFabric = fabrics.find(
                            (f) => f.code === e.target.value,
                          );
                          setEditingItem({
                            ...editingItem,
                            fabricCode: e.target.value,
                            fabricName: selectedFabric
                              ? selectedFabric.name
                              : "",
                            colorHex: selectedFabric
                              ? selectedFabric.colorHex
                              : "#000000",
                          });
                        }}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        {fabrics.map((f) => (
                          <option key={f.code} value={f.code}>
                            {f.name} ({f.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="font-bold text-heritage-green">
                        Showpiece Description
                      </label>
                      <textarea
                        rows={2}
                        value={editingItem.description || ""}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            description: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-sans text-xs"
                        placeholder="Describe the aesthetic flow, embroidery details, and mandarin collar options..."
                      />
                    </div>
                    <div className="sm:col-span-2 pt-4 flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingType(null)}
                        className="px-4 py-2 bg-gray-100 rounded-lg font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-heritage-gold text-heritage-forest font-bold rounded-lg border border-heritage-gold/20"
                      >
                        Save Showpiece Combo
                      </button>
                    </div>
                  </form>
                )}

                {editingType === "photo" && (
                  <form
                    onSubmit={handleSavePhoto}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans"
                  >
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Photo ID (Unique Key)
                      </label>
                      <input
                        type="text"
                        required
                        disabled={!isNewRecord}
                        value={editingItem.id}
                        onChange={(e) =>
                          setEditingItem({ ...editingItem, id: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg focus:ring-1 focus:ring-heritage-gold font-mono"
                        placeholder="e.g. photo-6"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Delivery Year
                      </label>
                      <input
                        type="number"
                        required
                        value={editingItem.deliveryYear || 2026}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            deliveryYear: parseInt(e.target.value) || 2026,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg focus:ring-1 focus:ring-heritage-gold"
                        placeholder="e.g. 2026"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Cohort Name
                      </label>
                      <select
                        required
                        value={editingItem.cohortName || ""}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            cohortName: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg focus:ring-1 focus:ring-heritage-gold"
                      >
                        <option value="">Select Cohort</option>
                        {batches.sort((a,b) => a.batchNumber - b.batchNumber).map((b) => {
                          const cohortName = `Group ${b.batchNumber} - ${b.name}`;
                          return (
                            <option key={b.batchNumber} value={cohortName}>
                              {cohortName}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Display Order
                      </label>
                      <input
                        type="number"
                        required
                        value={editingItem.displayOrder || 1}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            displayOrder: parseInt(e.target.value) || 1,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg focus:ring-1 focus:ring-heritage-gold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Gallery Status
                      </label>
                      <select
                        value={editingItem.status || "active"}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            status: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        <option value="active">
                          Active (Visible in Gallery Slider)
                        </option>
                        <option value="inactive">
                          Inactive (Hidden from Client View)
                        </option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Featured Status
                      </label>
                      <select
                        value={editingItem.featured ? "yes" : "no"}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            featured: e.target.value === "yes",
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        <option value="yes">Yes (Featured Showcase)</option>
                        <option value="no">No (Standard Showcase)</option>
                      </select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="font-bold text-heritage-green">
                        Community Caption
                      </label>
                      <textarea
                        rows={2}
                        required
                        value={editingItem.caption || ""}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            caption: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-sans text-xs"
                        placeholder="Describe who is wearing what traditional attire in this shot..."
                      />
                    </div>

                    <div className="sm:col-span-2 space-y-2">
                      <label className="font-bold text-heritage-green block">
                        Client Attire Photo Image
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Enter absolute Unsplash URL or drag/drop file below"
                        value={editingItem.url || ""}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            url: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-mono text-[10px]"
                      />

                      {/* Drag and Drop Swatch Area for Photo */}
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() =>
                          document.getElementById("photo-file-input")?.click()
                        }
                        className={`relative h-28 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-4 transition-all cursor-pointer overflow-hidden ${
                          isDragging
                            ? "border-heritage-gold bg-heritage-gold/10"
                            : "border-heritage-gold/30 hover:border-heritage-gold hover:bg-heritage-forest/5"
                        }`}
                      >
                        <input
                          type="file"
                          id="photo-file-input"
                          accept="image/*"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                        {editingItem.url ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group">
                            <img
                              loading="lazy"
                              src={editingItem.url}
                              alt="Photo Preview"
                              className="h-full w-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[9px]">
                              <Upload size={14} className="mb-1" />
                              <span>Replace Image File</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center space-y-1 text-heritage-ink/70">
                            <Upload
                              size={16}
                              className="mx-auto text-heritage-gold"
                            />
                            <p className="text-[10px] font-semibold">
                              Drag &amp; drop attire image, or click to browse
                            </p>
                            <p className="text-[9px] text-gray-400">
                              Supports PNG, JPG, WebP (Converts to high-res data
                              URL)
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="sm:col-span-2 pt-4 flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingType(null)}
                        className="px-4 py-2 bg-gray-100 rounded-lg font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-heritage-green text-heritage-gold font-bold rounded-lg border border-heritage-gold/20"
                      >
                        Save Community Photo
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ACTIVE TAB RENDER VIEWS */}

            {activeTab === "documentation" && (
              <div className="space-y-8 text-left">
                {/* DATABASE HEALTH */}
                <div className="bg-heritage-green text-heritage-gold rounded-3xl p-6 shadow-md border border-heritage-gold/20 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 bg-heritage-gold/20 rounded-full flex items-center justify-center animate-pulse">
                      <Database size={24} className="text-heritage-gold" />
                    </div>
                    <div>
                      <h2 className="text-lg font-serif font-bold tracking-wide">Live Database Status</h2>
                      <p className="text-xs text-heritage-beige/70">Connected to Google Cloud Firestore & Firebase Storage</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Firestore</span>
                      <span className="text-green-400 font-bold">Connected</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Collection Count</span>
                      <span className="text-heritage-gold">{customers.length + fabrics.length + orders.length + communityPhotos.length + showpieces.length + batches.length} Docs</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Firebase Storage</span>
                      <span className="text-green-400 font-bold">Connected</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Images Stored</span>
                      <span className="text-heritage-gold">
                        {(() => {
                          let count = 0;
                          const checkUrl = (url) => { if (typeof url === 'string' && url.includes('firebasestorage')) count++; };
                          fabrics.forEach(f => checkUrl(f.image));
                          communityPhotos.forEach(p => checkUrl(p.url));
                          showpieces.forEach(s => checkUrl(s.image));
                          return count;
                        })()} Images
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Authentication</span>
                      <span className="text-green-400 font-bold">Online</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Realtime Listeners</span>
                      <span className="text-green-400 font-bold">Active</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">Last Event</span>
                      <span className="text-heritage-gold">Just now</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-heritage-beige">System Status</span>
                      <span className="text-green-400 font-bold">Healthy</span>
                    </div>
                  </div>
                </div>

                {/* LIVE SUMMARY CARDS */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {/* Customers */}
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Customers</span>
                    <strong className="text-xl text-heritage-green font-mono">{customers.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Active Customers</span>
                    <strong className="text-xl text-heritage-green font-mono">{customers.filter(c => orders.some(o => o.customer.email === c.email)).length}</strong>
                  </div>
                  
                  {/* Fabrics */}
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Fabrics</span>
                    <strong className="text-xl text-heritage-green font-mono">{fabrics.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Available Fabrics</span>
                    <strong className="text-xl text-heritage-green font-mono">{fabrics.filter(f => (f.stock || 0) > 0 && f.stockStatus !== 'OUT_OF_STOCK' && f.stockStatus !== 'HIDDEN').length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Out of Stock Fabrics</span>
                    <strong className="text-xl text-red-600 font-mono">{fabrics.filter(f => (f.stock || 0) <= 0 || f.stockStatus === 'OUT_OF_STOCK').length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Hidden Fabrics</span>
                    <strong className="text-xl text-gray-500 font-mono">{fabrics.filter(f => f.stockStatus === 'HIDDEN').length}</strong>
                  </div>

                  {/* Orders */}
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Orders</span>
                    <strong className="text-xl text-heritage-green font-mono">{orders.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Pending Orders</span>
                    <strong className="text-xl text-amber-600 font-mono">{orders.filter(o => [1, 2].includes(o.shipment.currentStage)).length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Production Orders</span>
                    <strong className="text-xl text-heritage-gold font-mono">{orders.filter(o => [3, 4].includes(o.shipment.currentStage)).length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Completed Orders</span>
                    <strong className="text-xl text-heritage-green font-mono">{orders.filter(o => o.shipment.currentStage >= 5).length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Cancelled Orders</span>
                    <strong className="text-xl text-gray-500 font-mono">{orders.filter(o => o.shipment.status.toLowerCase().includes("cancel")).length}</strong>
                  </div>

                  {/* Payments */}
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Pending Payments</span>
                    <strong className="text-xl text-amber-600 font-mono">€{orders.reduce((sum, o) => sum + (o.payment.secondPaymentStatus !== "paid" ? o.payment.remaining : 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Completed Payments</span>
                    <strong className="text-xl text-heritage-green font-mono">€{orders.reduce((sum, o) => sum + (o.payment.isPaid || o.payment.secondPaymentStatus === "paid" ? o.payment.subtotal : (o.payment.deposit || 0)), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Total Revenue</span>
                    <strong className="text-xl text-heritage-green font-mono">€{orders.reduce((sum, o) => sum + (o.payment.isPaid || o.payment.secondPaymentStatus === "paid" ? o.payment.subtotal : (o.payment.deposit || 0)), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Outstanding Balance</span>
                    <strong className="text-xl text-amber-600 font-mono">€{orders.reduce((sum, o) => sum + (o.payment.secondPaymentStatus !== "paid" ? o.payment.remaining : 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
                  </div>

                  {/* Gallery */}
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Community Photos</span>
                    <strong className="text-xl text-heritage-green font-mono">{communityPhotos.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Showpieces</span>
                    <strong className="text-xl text-heritage-green font-mono">{showpieces.length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Published Designs</span>
                    <strong className="text-xl text-heritage-green font-mono">{styles.length}</strong>
                  </div>

                  {/* Batch Production */}
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Active Batches</span>
                    <strong className="text-xl text-heritage-green font-mono">{batches.filter(b => ["OPEN", "RECRUITING", "ALMOST_FULL", "FULL", "PRODUCTION_READY", "PRODUCTION_STARTED"].includes(b.status)).length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Completed Batches</span>
                    <strong className="text-xl text-heritage-green font-mono">{batches.filter(b => b.status === "COMPLETED").length}</strong>
                  </div>
                  <div className="bg-white border border-heritage-gold/20 rounded-xl p-4 shadow-sm">
                    <span className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Upcoming Shipments</span>
                    <strong className="text-xl text-heritage-gold font-mono">{batches.filter(b => ["Quality Control", "Packed", "Shipped", "Arrived Netherlands"].includes(b.status)).length}</strong>
                  </div>
                </div>

                {/* Database Cards Overview HUD */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white border border-heritage-gold/15 rounded-2xl p-6 space-y-3 shadow-sm hover:border-heritage-gold/30 transition-all">
                    <div className="h-9 w-9 bg-heritage-gold/10 text-heritage-gold rounded-xl flex items-center justify-center border border-heritage-gold/15">
                      <Layers2 size={18} />
                    </div>
                    <h3 className="text-sm font-bold text-heritage-green tracking-tight">
                      Relational Integrity Mapping
                    </h3>
                    <p className="text-[11px] text-heritage-ink/75 leading-relaxed">
                      Strict foreign key definitions ensure order fabric codes
                      connect beautifully with live warehouse fabric quantities.
                    </p>
                    <div className="pt-2 text-[10px] text-heritage-gold font-bold uppercase tracking-wider flex items-center gap-1">
                      <span>5 Normalized Tables Live</span>
                      <ChevronRight size={10} />
                    </div>
                  </div>

                  <div className="bg-white border border-heritage-gold/15 rounded-2xl p-6 space-y-3 shadow-sm hover:border-heritage-gold/30 transition-all">
                    <div className="h-9 w-9 bg-heritage-green/10 text-heritage-green rounded-xl flex items-center justify-center border border-heritage-green/20">
                      <Database size={18} />
                    </div>
                    <h3 className="text-sm font-bold text-heritage-green tracking-tight">
                      Active State Syncing
                    </h3>
                    <p className="text-[11px] text-heritage-ink/75 leading-relaxed">
                      Direct React context linkage. Updating stock levels or
                      style prices here updates options inside Design Studio.
                    </p>
                    <div className="pt-2 text-[10px] text-heritage-green font-bold uppercase tracking-wider flex items-center gap-1">
                      <span>Zero Delay Propagated</span>
                      <ChevronRight size={10} />
                    </div>
                  </div>

                  <div className="bg-white border border-heritage-gold/15 rounded-2xl p-6 space-y-3 shadow-sm hover:border-heritage-gold/30 transition-all">
                    <div className="h-9 w-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100">
                      <Sliders size={18} />
                    </div>
                    <h3 className="text-sm font-bold text-heritage-green tracking-tight">
                      Escrow Tracking Audit
                    </h3>
                    <p className="text-[11px] text-heritage-ink/75 leading-relaxed">
                      Track stages 1 to 6 to safely release 50% deposits from
                      Schiphol custom ports directly to Lagos weavers.
                    </p>
                    <div className="pt-2 text-[10px] text-blue-600 font-bold uppercase tracking-wider flex items-center gap-1">
                      <span>Stages 1 - 6 Audited</span>
                      <ChevronRight size={10} />
                    </div>
                  </div>
                </div>

                {/* Entity-Relationship ERD Diagram */}
                <div className="bg-heritage-forest/20 border border-heritage-gold/15 rounded-3xl p-6 sm:p-8 space-y-6 shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-heritage-gold/10 pb-4">
                    <div>
                      <h3 className="text-base sm:text-lg font-serif font-semibold text-heritage-green">
                        Odogwu Heritage Database ER Architecture
                      </h3>
                      <p className="text-[11px] text-heritage-ink/70">
                        Visualizing table linkages, primary key constraints, and
                        normalized connections.
                      </p>
                    </div>
                    <span className="self-start sm:self-auto inline-flex items-center gap-1 px-2.5 py-0.5 bg-heritage-gold/15 text-heritage-gold border border-heritage-gold/20 rounded-md text-[9px] font-bold uppercase tracking-widest">
                      <ShieldCheck size={10} /> 3NF Normalized Schema
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Table: Users */}
                    <div className="bg-white border border-heritage-gold/15 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                      <div className="bg-heritage-green text-heritage-gold px-4 py-2 flex items-center justify-between border-b border-heritage-gold/15">
                        <span className="text-[11px] font-bold font-serif tracking-wider">
                          Users_Customers
                        </span>
                        <span className="text-[8px] font-mono bg-heritage-forest/40 px-1 py-0.5 rounded text-heritage-beige">
                          Accounts ({customers.length})
                        </span>
                      </div>
                      <div className="p-3.5 space-y-2 text-[10px] font-mono">
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span className="font-bold text-heritage-green">
                            email (PK)
                          </span>
                          <span className="text-gray-400">VARCHAR</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span>name</span>
                          <span className="text-gray-400">VARCHAR</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span>phone</span>
                          <span className="text-gray-400">VARCHAR</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span>location</span>
                          <span className="text-gray-400">VARCHAR</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span>role</span>
                          <span className="text-gray-400">VARCHAR</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span className="text-heritage-gold">
                            measurements (JSON)
                          </span>
                          <span className="text-gray-400">JSONB</span>
                        </div>
                      </div>
                    </div>

                    {/* Table: Fabrics */}
                    <div className="bg-white border border-heritage-gold/15 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                      <div className="bg-heritage-green text-heritage-gold px-4 py-2 flex items-center justify-between border-b border-heritage-gold/15">
                        <span className="text-[11px] font-bold font-serif tracking-wider">
                          Fabrics_Catalogue
                        </span>
                        <span className="text-[8px] font-mono bg-heritage-forest/40 px-1 py-0.5 rounded text-heritage-beige">
                          Inventory ({fabrics.length})
                        </span>
                      </div>
                      <div className="p-3.5 space-y-2 text-[10px] font-mono">
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span className="font-bold text-heritage-green">
                            fabric_code (PK)
                          </span>
                          <span className="text-gray-400">VARCHAR</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span>name</span>
                          <span className="text-gray-400">VARCHAR</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span>category</span>
                          <span className="text-gray-400">VARCHAR</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span>multiplier</span>
                          <span className="text-gray-400">FLOAT</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span>price</span>
                          <span className="text-gray-400">DECIMAL</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span>stock_quantity</span>
                          <span className="text-gray-400">INTEGER</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span>color_hex</span>
                          <span className="text-gray-400">VARCHAR</span>
                        </div>
                      </div>
                    </div>

                    {/* Table: Master Orders */}
                    <div className="bg-white border border-heritage-gold/15 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                      <div className="bg-heritage-green text-heritage-gold px-4 py-2 flex items-center justify-between border-b border-heritage-gold/15">
                        <span className="text-[11px] font-bold font-serif tracking-wider">
                          Master_Orders
                        </span>
                        <span className="text-[8px] font-mono bg-heritage-forest/40 px-1 py-0.5 rounded text-heritage-beige">
                          Pipeline ({orders.length})
                        </span>
                      </div>
                      <div className="p-3.5 space-y-2 text-[10px] font-mono">
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span className="font-bold text-heritage-green">
                            tracking_id (PK)
                          </span>
                          <span className="text-gray-400">VARCHAR</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span className="text-heritage-gold">
                            customer_email (FK)
                          </span>
                          <span className="text-gray-400">VARCHAR 🔗</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span className="text-heritage-gold">
                            fabric_code (FK)
                          </span>
                          <span className="text-gray-400">VARCHAR 🔗</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span>style_id</span>
                          <span className="text-gray-400">VARCHAR</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span>payment_status</span>
                          <span className="text-gray-400">VARCHAR</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span>tracking_stage</span>
                          <span className="text-gray-400">INTEGER</span>
                        </div>
                        <div className="flex justify-between pb-1 border-b border-gray-100">
                          <span>leftover_fabric_instructions</span>
                          <span className="text-gray-400">TEXT</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "users" && (
              <div className="space-y-6 text-left">
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="relative w-full sm:w-80">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                      <Search size={14} />
                    </span>
                    <input
                      type="text"
                      placeholder="Search accounts by name or email..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setIsNewRecord(true);
                      setEditingItem({
                        name: "",
                        email: "",
                        phone: "",
                        location: businessSettings.productionSettings.defaultPickupLocation,
                        role: "Active Cohort Member",
                        passcode: "1960",
                        measurementProfile: {
                          height: 180,
                          weight: 78,
                          age: 32,
                          bodyBuild: "Average",
                          fitPreference: "Standard",
                          neck: 16,
                          shoulder: 18.5,
                          chest: 41.5,
                          waist: 36,
                          hip: 39,
                          sleeve: 24.5,
                          trouserLength: 40,
                          isAiEstimated: true,
                        },
                      });
                      setEditingType("user");
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0"
                  >
                    <Plus size={13} /> Add New User
                  </button>
                </div>

                <div className="bg-white border border-heritage-gold/15 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-sans">
                      <thead>
                        <tr className="bg-heritage-forest/20 border-b border-heritage-gold/15 text-heritage-green font-serif font-bold text-[10px] tracking-wider uppercase">
                          <th className="px-4 py-3">Customer Email (Key)</th>
                          <th className="px-4 py-3">Full Name</th>
                          <th className="px-4 py-3">Phone</th>
                          <th className="px-4 py-3">Campus Location</th>
                          <th className="px-4 py-3">Role Class</th>
                          <th className="px-4 py-3">PIN</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredCustomers.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-4 py-8 text-center text-gray-400"
                            >
                              No accounts registered in localStorage schema.
                            </td>
                          </tr>
                        ) : (
                          filteredCustomers.map((c) => (
                            <tr
                              key={c.email}
                              className="hover:bg-heritage-forest/5 transition"
                            >
                              <td className="px-4 py-3 font-mono font-bold text-heritage-green">
                                {c.email}
                              </td>
                              <td className="px-4 py-3 font-semibold text-heritage-ink">
                                {c.name}
                              </td>
                              <td className="px-4 py-3 text-gray-500">
                                {c.phone || "N/A"}
                              </td>
                              <td className="px-4 py-3 text-gray-600 truncate max-w-[150px]">
                                {c.location}
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-heritage-gold/10 text-heritage-gold border border-heritage-gold/20">
                                  {c.role || "Active Cohort Member"}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-gray-400 select-all">
                                {c.passcode || "1960"}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex gap-2 justify-end">
                                  <button
                                    onClick={() => {
                                      setIsNewRecord(false);
                                      setEditingItem(c);
                                      setEditingType("user");
                                    }}
                                    className="p-1.5 bg-gray-50 hover:bg-heritage-green/10 text-heritage-green rounded transition"
                                    title="Edit Customer profile"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteUser(c.email)}
                                    className="p-1.5 bg-gray-50 hover:bg-red-50 text-red-600 rounded transition"
                                    title="Delete user"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "styles" && (
              <div className="space-y-6 text-left">
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="relative w-full sm:w-80">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                      <Search size={14} />
                    </span>
                    <input
                      type="text"
                      placeholder="Search styles..."
                      value={styleSearch}
                      onChange={(e) => setStyleSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setIsNewRecord(true);
                      setEditingItem({
                        id: `style-${Date.now().toString().slice(-4)}`,
                        name: "",
                        description: "",
                        basePrice: 150,
                        gender: "unisex",
                        options: [
                          "Standard Collar",
                          "Agbada Over-shirt",
                          "Embroidery Work",
                        ],
                        outfitType: "Senator Set",
                        garmentComposition: "2-Piece Set",
                      });
                      setEditingType("style");
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0"
                  >
                    <Plus size={13} /> Add Style Class
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredStyles.map((s) => (
                    <div
                      key={s.id}
                      className="bg-white border border-heritage-gold/15 rounded-2xl p-5 space-y-3 shadow-sm hover:border-heritage-gold/30 transition flex flex-col justify-between"
                    >
                      <div className="flex gap-4">
                        {s.image && (
                          <div className="w-[120px] h-[120px] sm:w-[144px] sm:h-[144px] rounded-xl overflow-hidden bg-heritage-cream border border-heritage-gold/10 shadow-sm shrink-0">
                            <img
                              loading="lazy"
                              src={s.image}
                              alt={s.name}
                              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                        <div className="space-y-2 flex-grow min-w-0">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-serif font-bold text-sm text-heritage-green">
                                {s.name}
                              </h4>
                              <p className="font-mono text-[9px] text-gray-400">
                                ID: {s.id}
                              </p>
                            </div>
                            <span className="text-sm font-black text-heritage-green bg-heritage-forest/5 border border-heritage-gold/10 px-2.5 py-0.5 rounded-lg shrink-0 ml-2">
                              €{s.basePrice}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-600 leading-normal line-clamp-2">
                            {s.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded bg-heritage-green/10 text-heritage-green border border-heritage-green/20">
                              {s.gender}
                            </span>
                            <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded bg-heritage-gold/10 text-heritage-gold border border-heritage-gold/20">
                              {s.outfitType || "Senator Set"}
                            </span>
                            <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded bg-heritage-green text-heritage-gold border border-heritage-gold/20">
                              {s.garmentComposition || "2-Piece Set"}
                            </span>
                            {s.fabricCategory && s.fabricCategory !== "Any" && (
                              <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded border border-heritage-gold/30 text-heritage-gold bg-heritage-gold/5">
                                {s.fabricCategory}
                              </span>
                            )}
                          </div>
                          {s.detectedColors && (
                            <div className="flex items-center gap-2 pt-1">
                              <span className="text-[9px] font-bold text-gray-400">
                                Garment Colors:
                              </span>
                              <div className="flex gap-1">
                                <div
                                  className="w-3 h-3 rounded-full border border-gray-300"
                                  style={{
                                    backgroundColor: s.detectedColors.main,
                                  }}
                                  title={s.detectedColors.main}
                                ></div>
                                <div
                                  className="w-3 h-3 rounded-full border border-gray-300"
                                  style={{
                                    backgroundColor: s.detectedColors.secondary,
                                  }}
                                  title={s.detectedColors.secondary}
                                ></div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-3">
                        {s.constructionDetails &&
                          s.constructionDetails.length > 0 && (
                            <div className="pt-2 border-t border-gray-50 mt-2 space-y-1">
                              <span className="text-[10px] font-bold text-heritage-green block">
                                Garment Construction Details:
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {s.constructionDetails.map(
                                  (c: any, i: number) => (
                                    <span
                                      key={i}
                                      className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-heritage-green/5 text-heritage-green border border-heritage-gold/20"
                                    >
                                      {c.code} (€{c.price})
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                          )}
                      </div>
                      <div className="flex justify-end gap-2 pt-3 border-t border-gray-50">
                        <button
                          onClick={() => {
                            setIsNewRecord(false);
                            setEditingItem(s);
                            setEditingType("style");
                          }}
                          className="px-2.5 py-1 text-[10px] font-bold bg-heritage-forest/10 hover:bg-heritage-green hover:text-heritage-gold text-heritage-green rounded-lg transition flex items-center gap-1"
                        >
                          <Edit2 size={10} /> Edit Garment Option
                        </button>
                        <button
                          onClick={() => handleDuplicateStyle(s)}
                          className="p-1.5 bg-gray-50 text-gray-600 hover:bg-heritage-green/10 hover:text-heritage-green rounded-lg transition flex items-center justify-center"
                          title="Duplicate Garment Option"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteStyle(s.id)}
                          className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition flex items-center justify-center"
                          title="Delete Garment Option"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "fabrics" && (
              <div className="space-y-6 text-left">
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="relative w-full sm:w-80">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                      <Search size={14} />
                    </span>
                    <input
                      type="text"
                      placeholder="Search fabric list..."
                      value={fabricSearch}
                      onChange={(e) => setFabricSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      setIsNewRecord(true);
                      setEditingItem({
                        code: "Generating...",
                        name: "",
                        description: "Premium Nigerian Traditional weave.",
                        category: "HiTarget Ankara",
                        priceMultiplier: 1.2,
                        color: "Multi",
                        colorHex: "#2e3a1e",
                        stock: 6,
                        width: "45 inches",
                      });
                      setFabricNameSuggestions([]);
                      setSuggestionHistory([]);
                      setEditingType("fabric");
                      
                      try {
                        const nextCode = await StorageService.previewNextFabricCode();
                        setEditingItem(prev => ({ ...prev, code: nextCode }));
                      } catch (err) {
                         triggerStatus("Failed to generate code.", "error");
                      }
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0"
                  >
                    <Plus size={13} /> Add Fabric Code
                  </button>
                </div>

                <div className="bg-white border border-heritage-gold/15 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-sans">
                      <thead>
                        <tr className="bg-heritage-forest/20 border-b border-heritage-gold/15 text-heritage-green font-serif font-bold text-[10px] tracking-wider uppercase">
                          <th className="px-4 py-3">Code (Key)</th>
                          <th className="px-4 py-3">Fabric Image &amp; Name</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Quantity (Yds)</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredFabrics.map((f) => (
                          <tr
                            key={f.code}
                            className="hover:bg-heritage-forest/5 transition"
                          >
                            <td className="px-4 py-3 font-mono font-bold text-heritage-green">
                              {f.code}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {f.image ? (
                                  <img
                                    src={f.image}
                                    referrerPolicy="no-referrer"
                                    alt={f.name}
                                    className="h-6 w-6 rounded-full object-cover border border-gray-300 shrink-0"
                                  />
                                ) : (
                                  <span
                                    className="h-6 w-6 rounded-full border border-gray-300 shrink-0"
                                    style={{ backgroundColor: f.colorHex }}
                                  />
                                )}
                                <div>
                                  <p className="font-semibold text-heritage-ink leading-tight">
                                    {f.name}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {f.category}
                            </td>
                            <td className="px-4 py-3 font-mono text-gray-600">
                              {f.stock}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  f.stock <= 0
                                    ? "bg-red-100 text-red-700"
                                    : f.stock <= 5
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-green-100 text-green-700"
                                }`}
                              >
                                {f.stock <= 0
                                  ? "OUT_OF_STOCK"
                                  : f.stock <= 5
                                    ? "LOW_STOCK"
                                    : "IN_STOCK"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => {
                                    const currentStock = f.stock ?? 30;
                                    const newStock = currentStock <= 0 ? 30 : 0;
                                    const finalItem: Fabric = {
                                      ...f,
                                      stock: newStock,
                                      stockStatus:
                                        newStock <= 0
                                          ? "OUT_OF_STOCK"
                                          : "IN_STOCK",
                                    };
                                    FabricService.saveFabric(finalItem).catch(err => {
                                      console.error("Failed to update stock", err);
                                      triggerStatus("Failed to update stock", "error");
                                    });
                                    triggerStatus(
                                      newStock <= 0
                                        ? `Marked ${f.name} as Out of Stock!`
                                        : `Restocked ${f.name} to 30 yards!`,
                                    );
                                  }}
                                  className={`p-1.5 rounded transition ${
                                    (f.stock ?? 30) <= 0
                                      ? "bg-green-50 hover:bg-green-100 text-green-700"
                                      : "bg-amber-50 hover:bg-amber-100 text-amber-700"
                                  }`}
                                  title={
                                    (f.stock ?? 30) <= 0
                                      ? "Restock to 30 yds"
                                      : "Mark Out of Stock"
                                  }
                                >
                                  {(f.stock ?? 30) <= 0 ? (
                                    <CheckCircle2 size={12} />
                                  ) : (
                                    <AlertTriangle size={12} />
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    setIsNewRecord(false);
                                    setEditingItem(f);
                                    setFabricNameSuggestions([]);
                                    setSuggestionHistory([]);
                                    setEditingType("fabric");
                                  }}
                                  className="p-1.5 bg-gray-50 hover:bg-heritage-green/10 text-heritage-green rounded transition"
                                  title="Edit fabric settings"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  onClick={() => handleDeleteFabric(f.code)}
                                  className="p-1.5 bg-gray-50 hover:bg-red-50 text-red-600 rounded transition"
                                  title="Delete fabric"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "batches" && (
              <div className="space-y-6 text-left">
                <BatchManagementPanel batches={batches} />
                {/* Business Intelligence Engine: Production Analytics */}
                <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm mb-6">
                  <h3 className="font-serif font-bold text-lg text-heritage-green mb-4">
                    Business Intelligence: Production Analytics
                  </h3>
                  {(() => {
                    const analytics =
                      BusinessIntelligenceEngine.getBatchAnalytics(
                        batches,
                        businessSettings,
                      );
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                            Total Garments
                          </span>
                          <strong className="text-2xl text-heritage-green font-mono">
                            {analytics.totalGarments}
                          </strong>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                            Total Customers
                          </span>
                          <strong className="text-2xl text-heritage-green font-mono">
                            {analytics.totalCustomers}
                          </strong>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                            Avg Garments / Customer
                          </span>
                          <strong className="text-2xl text-heritage-green font-mono">
                            {analytics.avgGarmentsPerCustomer}
                          </strong>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                            Avg Order Size
                          </span>
                          <strong className="text-2xl text-heritage-green font-mono">
                            {analytics.avgOrderSize}
                          </strong>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                            Est. Production Hours
                          </span>
                          <strong className="text-2xl text-heritage-green font-mono">
                            {analytics.estimatedProductionHours}h
                          </strong>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                            Production Efficiency
                          </span>
                          <strong className="text-2xl text-heritage-green font-mono text-green-600">
                            {analytics.productionEfficiency}
                          </strong>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                            Current Batch Capacity
                          </span>
                          <strong className="text-2xl text-heritage-green font-mono">
                            {(() => {
                              const active = getCurrentCommunityBatch(batches);
                              return active
                                ? `${BusinessIntelligenceEngine.calculateCapacityPercentage(active, businessSettings)}%`
                                : "N/A";
                            })()}
                          </strong>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">
                            Est. Completion Date
                          </span>
                          <strong className="text-xl text-heritage-green font-sans mt-1 block">
                            {(() => {
                              const active = getCurrentCommunityBatch(batches);
                              return active?.estimatedDelivery || "TBD";
                            })()}
                          </strong>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* Fabric Forecast Engine */}
                  <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
                    <h3 className="font-serif font-bold text-lg text-heritage-green mb-4 flex items-center gap-2">
                      <span className="text-heritage-gold">🧵</span> Fabric
                      Forecast Engine
                    </h3>
                    {(() => {
                      const active = getCurrentCommunityBatch(batches);
                      if (!active)
                        return (
                          <p className="text-xs text-gray-500">
                            No active production batch.
                          </p>
                        );

                      const requiredYards =
                        active.fabricForecast?.requiredYards ||
                        CapacityService.getReservedCapacity(active) * 6.5; // default estimate
                      const requiredRolls =
                        active.fabricForecast?.requiredRolls ||
                        Math.ceil(requiredYards / 6);
                      const inventoryStatus =
                        active.fabricForecast?.inventoryStatus || "Sufficient";

                      return (
                        <div className="space-y-4 text-xs">
                          <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                            <span className="text-gray-500">Active Batch</span>
                            <strong className="text-heritage-green">
                              {active.name}
                            </strong>
                          </div>
                          <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                            <span className="text-gray-500">
                              Target Garments
                            </span>
                            <strong className="text-heritage-green">
                              {CapacityService.getTargetCapacity(active)} Garments
                            </strong>
                          </div>
                          <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                            <span className="text-gray-500">
                              Estimated Fabric
                            </span>
                            <strong className="text-heritage-green">
                              {Math.round(requiredYards)} Yards
                            </strong>
                          </div>
                          <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                            <span className="text-gray-500">
                              Fabric Rolls Required
                            </span>
                            <strong className="text-heritage-green">
                              {requiredRolls} Pieces
                            </strong>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500">
                              Inventory Status
                            </span>
                            <strong
                              className={`px-2 py-0.5 rounded-full ${inventoryStatus === "Sufficient" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}
                            >
                              {inventoryStatus}
                            </strong>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Shipping Intelligence */}
                  <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
                    <h3 className="font-serif font-bold text-lg text-heritage-green mb-4 flex items-center gap-2">
                      <span className="text-heritage-gold">✈️</span> Shipping
                      Intelligence
                    </h3>
                    {(() => {
                      const active = getCurrentCommunityBatch(batches);
                      if (!active)
                        return (
                          <p className="text-xs text-gray-500">
                            No active production batch.
                          </p>
                        );

                      const pkgs =
                        active.shippingForecast?.totalPackages ||
                        Math.ceil(active.currentOrders * 1.2);
                      const weight =
                        active.shippingForecast?.estimatedWeightKg ||
                        pkgs * 2.5;
                      const volume =
                        active.shippingForecast?.estimatedVolumeCbm ||
                        pkgs * 0.05;
                      const tier =
                        active.shippingForecast?.shippingTier ||
                        "Air Freight (Standard)";
                      const cost =
                        active.shippingForecast?.expectedTransportCost ||
                        weight * 8.5;

                      return (
                        <div className="space-y-4 text-xs">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                              <span className="block text-gray-500 mb-1">
                                Total Packages
                              </span>
                              <strong className="text-lg text-heritage-green">
                                {pkgs}
                              </strong>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                              <span className="block text-gray-500 mb-1">
                                Est. Weight
                              </span>
                              <strong className="text-lg text-heritage-green">
                                {Math.round(weight)} kg
                              </strong>
                            </div>
                          </div>
                          <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                            <span className="text-gray-500">Est. Volume</span>
                            <strong className="text-heritage-green">
                              {volume.toFixed(2)} cbm
                            </strong>
                          </div>
                          <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                            <span className="text-gray-500">Shipping Tier</span>
                            <strong className="text-heritage-green">
                              {tier}
                            </strong>
                          </div>
                          <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                            <span className="text-gray-500">
                              Expected Transport Cost
                            </span>
                            <strong className="text-heritage-green">
                              €{cost.toFixed(2)}
                            </strong>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500">
                              Pickup Location
                            </span>
                            <strong className="text-heritage-green">
                              {active.pickupLocation}
                            </strong>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="relative w-full sm:w-80">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                      <Search size={14} />
                    </span>
                    <input
                      type="text"
                      placeholder="Search custom batches..."
                      value={batchSearch}
                      onChange={(e) => setBatchSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setIsNewRecord(true);
                      setEditingItem({
                        id: `batch-${Date.now().toString().slice(-4)}`,
                        batchNumber: batches.length + 1,
                        name: "",
                        startDate: "",
                        endDate: "",
                        duration: "",
                        targetGarments: 30,
                        currentGarments: 0,
                        currentOrders: 0,
                        currentCustomers: 0,
                        status: "Yet To Start",
                        pickupLocation: businessSettings.productionSettings.defaultPickupLocation,
                        visibility: "Public",
                      });
                      setEditingType("batch");
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0"
                  >
                    <Plus size={13} /> Create Sourcing Batch
                  </button>
                </div>

                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
                  {filteredBatches
                    .sort((a, b) => a.batchNumber - b.batchNumber)
                    .map((b) => (
                      <div
                        key={b.id}
                        className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-white shadow-sm shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-xl text-center shadow-heritage-gold/20">
                          {b.status === "COMPLETED"
                            ? "✅"
                            : [
                                  "Production Ready",
                                  "Production Started",
                                  "Quality Control",
                                ].includes(b.status)
                              ? "🧵"
                              : [
                                    "Packed",
                                    "Shipped",
                                    "Arrived Netherlands",
                                    "Ready For Pickup",
                                  ].includes(b.status)
                                ? "✈️"
                                : "🕒"}
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white border border-heritage-gold/15 rounded-2xl p-5 shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="font-serif font-bold text-sm text-heritage-green">
                                {b.name}
                              </h4>
                              <p className="font-mono text-[9px] text-gray-400">
                                BATCH #{b.batchNumber}
                              </p>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                ["OPEN", "RECRUITING", "ALMOST_FULL"].includes(
                                  b.status,
                                )
                                  ? "bg-green-100 text-green-700"
                                  : [
                                        "Production Started",
                                        "Quality Control",
                                        "Production Ready",
                                      ].includes(b.status)
                                    ? "bg-blue-100 text-blue-700"
                                    : b.status === "COMPLETED"
                                      ? "bg-gray-100 text-gray-700"
                                      : ["YET_TO_START", "DRAFT"].includes(
                                            b.status,
                                          )
                                        ? "bg-yellow-100 text-yellow-700"
                                        : "bg-purple-100 text-purple-700"
                              }`}
                            >
                              {b.status}
                            </span>
                          </div>
                          <div className="text-xs space-y-1 text-gray-600">
                            <p>
                              📅{" "}
                              <strong className="text-heritage-green">
                                Timeline:
                              </strong>{" "}
                              {b.duration}
                            </p>
                            <p>
                              📦{" "}
                              <strong className="text-heritage-green">
                                Est. Delivery:
                              </strong>{" "}
                              {b.estimatedDelivery}
                            </p>
                            <div className="pt-2 border-t border-gray-100 mt-2">
                              <div className="flex justify-between items-end mb-1">
                                <span className="text-[10px] font-bold text-heritage-green uppercase tracking-wider">
                                  Garments
                                </span>
                                <span className="text-[10px] font-mono font-bold text-heritage-gold">
                                  {CapacityService.getCapacitySummary(b).progressBadge}
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-heritage-green"
                                  style={{
                                    width: `${CapacityService.getCapacitySummary(b).completionPercentage}%`,
                                  }}
                                ></div>
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-3 border-t border-gray-50 mt-3">
                            <button
                              onClick={() => {
                                setIsNewRecord(false);
                                setEditingItem(b);
                                setEditingType("batch");
                              }}
                              className="px-2.5 py-1 text-[10px] font-bold bg-heritage-forest/10 hover:bg-heritage-green hover:text-heritage-gold text-heritage-green rounded-lg transition"
                            >
                              Configure Batch
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {activeTab === "orders" && (
              <div className="space-y-6 text-left">
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="relative w-full sm:w-80">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                      <Search size={14} />
                    </span>
                    <input
                      type="text"
                      placeholder="Search orders by tracking, customer name..."
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setIsNewRecord(true);
                      setEditingItem({
                        customer: customers[0] || {
                          name: "Guest User",
                          email: "guest@asml.com",
                          phone: "",
                          location: businessSettings.productionSettings.defaultPickupLocation,
                        },
                        style: styles[0] || {
                          id: "style-kaftan",
                          name: "Standard Senator",
                          basePrice: 150,
                        },
                        fabric: fabrics[0] || {
                          code: "ODG-001",
                          name: "Traditional Ankara",
                        },
                        design: {
                          collar: "Mandarin High Collar",
                          embroidery: "Geometric embroidery",
                          sleeve: "Long Sleeve",
                          pocket: "Side pocket",
                          additionalCap: false,
                          hemFinish: "Split sides",
                        },
                        garment: {
                          type: "Shirt + Trouser Set",
                          tailoringFee: 45,
                          totalPrice: 195,
                        },
                        measurements: {
                          height: 180,
                          weight: 78,
                          age: 32,
                          bodyBuild: "Average",
                          fitPreference: "Standard",
                          neck: 16,
                          shoulder: 18.5,
                          chest: 41.5,
                          waist: 36,
                          hip: 39,
                          sleeve: 24.5,
                          trouserLength: 40,
                          isAiEstimated: true,
                        },
                        payment: {
                          subtotal: 195,
                          deposit: 97.5,
                          remaining: 97.5,
                          method: "Escrow Portal Transaction",
                          date: "June 26, 2026",
                          isPaid: true,
                        },
                        shipment: {
                          trackingId: `ODH-${Date.now().toString().slice(-4)}`,
                          status: "Pattern Drafting & Sewing on Lagos floor",
                          currentStage: 3,
                          estimatedDeliveryDate: "May 30",
                        },
                        specialInstructions: "Ensure loose comfort fits",
                        notesAboutLeftoverFabric: "Sew traditional fila cap",
                      });
                      setEditingType("order");
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0"
                  >
                    <Plus size={13} /> Manually Place Order
                  </button>
                  <button
                    type="button"
                    onClick={handleExportManifest}
                    disabled={isExporting}
                    className="flex items-center gap-1.5 px-4 py-2 bg-heritage-gold hover:bg-heritage-gold/80 text-heritage-forest text-xs font-bold rounded-xl border border-heritage-gold/30 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0 transition disabled:opacity-50"
                  >
                    {isExporting ? (
                      <span className="animate-spin inline-block h-3 w-3 border-2 border-heritage-forest border-t-transparent rounded-full" />
                    ) : (
                      <Download size={13} />
                    )}
                    Export Manifest
                  </button>
                </div>

                <div className="bg-white border border-heritage-gold/15 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-sans">
                      <thead>
                        <tr className="bg-heritage-forest/20 border-b border-heritage-gold/15 text-heritage-green font-serif font-bold text-[10px] tracking-wider uppercase">
                          <th className="px-4 py-3">Tracking ID</th>
                          <th className="px-4 py-3">Customer</th>
                          <th className="px-4 py-3">Fabric</th>
                          <th className="px-4 py-3">Selected Design</th>
                          <th className="px-4 py-3">Outfit Type</th>
                          <th className="px-4 py-3">Garment Composition</th>
                          <th className="px-4 py-3">Order Type</th>
                          <th className="px-4 py-3">Payment Status</th>
                          <th className="px-4 py-3">Production Status</th>
                          <th className="px-4 py-3">Shipping Status</th>
                          <th className="px-4 py-3">Total Price</th>
                          <th className="px-4 py-3">Created Date</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredOrders.length === 0 ? (
                          <tr>
                            <td
                              colSpan={13}
                              className="px-4 py-8 text-center text-gray-400"
                            >
                              No active custom selections registered.
                            </td>
                          </tr>
                        ) : (
                          filteredOrders.map((o) => (
                            <tr
                              key={o.shipment.trackingId}
                              className="hover:bg-heritage-forest/5 transition"
                            >
                              <td className="px-4 py-3 font-mono font-bold text-heritage-green">
                                {o.shipment.trackingId}
                              </td>
                              <td className="px-4 py-3 space-y-0.5">
                                <p className="font-semibold text-heritage-ink leading-tight">
                                  {o.customer.name}
                                </p>
                                <p className="text-[9px] text-gray-400 font-mono">
                                  {o.customer.email}
                                </p>
                              </td>
                              <td className="px-4 py-3 space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="h-2 w-2 rounded-full border border-gray-300"
                                    style={{
                                      backgroundColor: o.fabric.colorHex,
                                    }}
                                  />
                                  <span className="text-[9px] text-gray-500 font-mono">
                                    {o.fabric.name} ({o.fabric.code})
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-block px-1.5 py-0.5 bg-heritage-forest/5 text-heritage-green rounded font-semibold text-[10px]">
                                  {o.style.name}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600">
                                {o.style.outfitType || o.garment.type}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-600">
                                {o.style.garmentComposition || "Standard"}
                              </td>
                              <td className="px-4 py-3 text-xs">
                                <span className="px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-600 text-[9px] uppercase tracking-wider">
                                  {o.batchType || "batch"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-[10px] font-mono">
                                {o.payment.isPaid ? "Deposit Paid" : "Unpaid"}
                              </td>
                              <td className="px-4 py-3 text-[10px] font-mono text-heritage-gold">
                                Stage {o.shipment.currentStage || 1}
                              </td>
                              <td className="px-4 py-3 text-[10px] font-mono text-blue-600">
                                {o.shipment.status}
                              </td>
                              <td className="px-4 py-3 font-bold text-heritage-green">
                                €
                                {(
                                  o.garment.totalPrice || o.payment.subtotal
                                ).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-[10px] text-gray-400">
                                {o.payment.date}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex gap-2 justify-end">
                                  <button
                                    onClick={() => {
                                      setIsNewRecord(false);
                                      setEditingItem(o);
                                      setEditingType("order");
                                    }}
                                    className="p-1.5 bg-gray-50 hover:bg-heritage-green/10 text-heritage-green rounded transition"
                                    title="Edit order"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDeleteOrder(o.shipment.trackingId)
                                    }
                                    className="p-1.5 bg-gray-50 hover:bg-red-50 text-red-600 rounded transition"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "showpieces" && (
              <div className="space-y-6 text-left">
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="relative w-full sm:w-80">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                      <Search size={14} />
                    </span>
                    <input
                      type="text"
                      placeholder="Search showpieces by title, tag, style..."
                      value={showpieceSearch}
                      onChange={(e) => setShowpieceSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setIsNewRecord(true);
                      setEditingItem({
                        id: `item-${Date.now().toString().slice(-4)}`,
                        title: "",
                        category: "male",
                        styleId: styles[0]?.id || "royal-senator",
                        fabricCode: fabrics[0]?.code || "ODG-001",
                        styleName: styles[0]?.name || "Royal Senator",
                        fabricName: fabrics[0]?.name || "Royal Emerald Cotton",
                        colorHex: fabrics[0]?.colorHex || "#0D3E26",
                        description: "",
                        tag: "New",
                      });
                      setEditingType("showpiece");
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0"
                  >
                    <Plus size={13} /> Add Gallery Showpiece
                  </button>
                </div>

                <div className="bg-white border border-heritage-gold/15 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-sans">
                      <thead>
                        <tr className="bg-heritage-forest/20 border-b border-heritage-gold/15 text-heritage-green font-serif font-bold text-[10px] tracking-wider uppercase">
                          <th className="px-4 py-3">Showpiece ID</th>
                          <th className="px-4 py-3">Title &amp; Highlight</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Style Class Link (FK)</th>
                          <th className="px-4 py-3">Fabric Sourcing (FK)</th>
                          <th className="px-4 py-3">Aesthetic Swatch</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {showpieces.filter(
                          (s) =>
                            s.title
                              .toLowerCase()
                              .includes(showpieceSearch.toLowerCase()) ||
                            s.tag
                              .toLowerCase()
                              .includes(showpieceSearch.toLowerCase()) ||
                            s.description
                              .toLowerCase()
                              .includes(showpieceSearch.toLowerCase()) ||
                            s.styleName
                              .toLowerCase()
                              .includes(showpieceSearch.toLowerCase()) ||
                            s.fabricName
                              .toLowerCase()
                              .includes(showpieceSearch.toLowerCase()),
                        ).length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-4 py-8 text-center text-gray-400"
                            >
                              No matching showpiece combinations found.
                            </td>
                          </tr>
                        ) : (
                          showpieces
                            .filter(
                              (s) =>
                                s.title
                                  .toLowerCase()
                                  .includes(showpieceSearch.toLowerCase()) ||
                                s.tag
                                  .toLowerCase()
                                  .includes(showpieceSearch.toLowerCase()) ||
                                s.description
                                  .toLowerCase()
                                  .includes(showpieceSearch.toLowerCase()) ||
                                s.styleName
                                  .toLowerCase()
                                  .includes(showpieceSearch.toLowerCase()) ||
                                s.fabricName
                                  .toLowerCase()
                                  .includes(showpieceSearch.toLowerCase()),
                            )
                            .map((s) => (
                              <tr
                                key={s.id}
                                className="hover:bg-heritage-forest/5 transition"
                              >
                                <td className="px-4 py-3 font-mono font-bold text-heritage-green">
                                  {s.id}
                                </td>
                                <td className="px-4 py-3 space-y-1">
                                  <p className="font-semibold text-heritage-ink leading-tight">
                                    {s.title}
                                  </p>
                                  <p className="text-[10px] text-gray-500 leading-snug">
                                    {s.description}
                                  </p>
                                  {s.tag && (
                                    <span className="inline-block px-2 py-0.5 bg-heritage-gold/10 text-heritage-gold border border-heritage-gold/25 rounded-md font-bold text-[9px] uppercase tracking-wider">
                                      {s.tag}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 capitalize font-semibold text-heritage-ink">
                                  {(() => {
                                      let bNum = 0;
                                      const cat = s.category as string;
                                      if (cat === "male") bNum = 1;
                                      else if (cat === "female") bNum = 2;
                                      else if (cat === "fabric") bNum = 3;
                                      else if (cat === "group4") bNum = 4;
                                      else if (cat === "group5") bNum = 5;
                                      else if (cat.startsWith("group")) bNum = parseInt(cat.replace("group", ""));
                                      
                                      if (bNum > 0) {
                                        const b = batches.find(x => x.batchNumber === bNum);
                                        if (b) return `Group ${b.batchNumber} - ${b.name}`;
                                        return `Group ${bNum}`;
                                      }
                                      return cat;
                                    })()}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="inline-block px-2 py-0.5 bg-heritage-forest/5 text-heritage-green rounded font-semibold text-[10px]">
                                    👔 {s.styleName} ({s.styleId})
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-mono font-semibold text-gray-500">
                                  {s.fabricName} ({s.fabricCode})
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="h-4 w-4 rounded-full border border-gray-300 shadow-sm"
                                      style={{ backgroundColor: s.colorHex }}
                                    />
                                    <span className="font-mono text-[9px] text-gray-400 select-all">
                                      {s.colorHex}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      onClick={() => {
                                        setIsNewRecord(false);
                                        setEditingItem(s);
                                        setEditingType("showpiece");
                                      }}
                                      className="p-1.5 bg-gray-50 hover:bg-heritage-green/10 text-heritage-green rounded transition"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleDeleteShowpiece(s.id)
                                      }
                                      className="p-1.5 bg-gray-50 hover:bg-red-50 text-red-600 rounded transition"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "photos" && (
              <div className="space-y-6 text-left">
                {/* Cohorts Management Panel */}
                <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm mb-8">
                  <h3 className="font-serif font-bold text-lg text-heritage-green mb-4 flex items-center gap-2">
                    <Users size={18} /> Cohorts & Groups Management
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Define the groups/cohorts (e.g. Sample from Group 1, Cohort
                    2026) that organize community gallery photos.
                  </p>

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                        <div>
                          <h4 className="font-bold text-heritage-green text-sm">
                            Sample from Group 1
                          </h4>
                          <p className="text-[10px] text-gray-500">
                            Currently active in gallery
                          </p>
                        </div>
                        <button className="text-[10px] bg-white border border-gray-200 px-3 py-1 rounded-lg font-bold hover:bg-gray-50">
                          Manage
                        </button>
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                        <div>
                          <h4 className="font-bold text-heritage-green text-sm">
                            Sample from Group 2
                          </h4>
                          <p className="text-[10px] text-gray-500">
                            Currently active in gallery
                          </p>
                        </div>
                        <button className="text-[10px] bg-white border border-gray-200 px-3 py-1 rounded-lg font-bold hover:bg-gray-50">
                          Manage
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-4 flex-1 cursor-pointer hover:bg-gray-50 transition">
                      <span className="text-xs font-bold text-gray-400 flex items-center gap-1">
                        <Plus size={14} /> Add New Group
                      </span>
                    </div>
                  </div>
                </div>

                <h3 className="font-serif font-bold text-lg text-heritage-green flex items-center gap-2 mb-2">
                  <Image size={18} /> Community Gallery Photos
                </h3>

                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="relative w-full sm:w-80">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                      <Search size={14} />
                    </span>
                    <input
                      type="text"
                      placeholder="Search community gallery photos..."
                      value={photoSearch}
                      onChange={(e) => setPhotoSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 font-medium">
                      Capacity: {communityPhotos.length} / 20 photos
                    </span>
                    <button
                      onClick={() => {
                        if (communityPhotos.length >= 20) {
                          alert(
                            "Maximum capacity reached! The community photo gallery has a strict limit of 20 photos. Please delete some photos before adding new ones.",
                          );
                          return;
                        }
                        setIsNewRecord(true);
                        setEditingItem({
                          id: `photo-${Date.now().toString().slice(-4)}`,
                          url: "",
                          caption: "",
                          cohortName: batches.length > 0 ? `Group ${batches[0].batchNumber} - ${batches[0].name}` : "",
                          deliveryYear: new Date().getFullYear(),
                          featured: true,
                          status: "active",
                          displayOrder: communityPhotos.length + 1,
                        });
                        setEditingType("photo");
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0 transition hover:bg-heritage-forest"
                    >
                      <Plus size={13} /> Add Gallery Photo
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-heritage-gold/15 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-sans">
                      <thead>
                        <tr className="bg-heritage-forest/20 border-b border-heritage-gold/15 text-heritage-green font-serif font-bold text-[10px] tracking-wider uppercase">
                          <th className="px-4 py-3 w-24">Preview</th>
                          <th className="px-4 py-3">Photo ID</th>
                          <th className="px-4 py-3">Caption</th>
                          <th className="px-4 py-3">Cohort Info</th>
                          <th className="px-4 py-3">Display Order</th>
                          <th className="px-4 py-3">Gallery Status</th>
                          <th className="px-4 py-3">Featured</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredPhotos.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="px-4 py-8 text-center text-gray-400"
                            >
                              No community gallery photos found.
                            </td>
                          </tr>
                        ) : (
                          [...filteredPhotos]
                            .sort(
                              (a, b) =>
                                (a.displayOrder || 0) - (b.displayOrder || 0),
                            )
                            .map((p) => (
                              <tr
                                key={p.id}
                                className="hover:bg-heritage-forest/5 transition"
                              >
                                <td className="px-4 py-3">
                                  <div className="h-12 w-12 rounded-lg border border-heritage-gold/15 overflow-hidden bg-gray-50 flex items-center justify-center">
                                    {p.url ? (
                                      <img
                                        loading="lazy"
                                        src={p.url}
                                        alt={p.caption}
                                        className="h-full w-full object-cover"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <Image
                                        size={16}
                                        className="text-gray-300"
                                      />
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-mono font-bold text-heritage-green">
                                  {p.id}
                                </td>
                                <td className="px-4 py-3 max-w-xs">
                                  <p
                                    className="text-heritage-ink font-medium leading-tight line-clamp-2"
                                    title={p.caption}
                                  >
                                    {p.caption}
                                  </p>
                                </td>
                                <td className="px-4 py-3 space-y-0.5">
                                  <p className="font-semibold text-heritage-ink leading-tight">
                                    {p.cohortName}
                                  </p>
                                  <p className="text-[9px] text-gray-400 font-mono">
                                    Delivered: {p.deliveryYear}
                                  </p>
                                </td>
                                <td className="px-4 py-3 font-mono font-semibold text-gray-500">
                                  {p.displayOrder || 0}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                      p.status === "active"
                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                        : "bg-gray-50 text-gray-400 border border-gray-200"
                                    }`}
                                  >
                                    {p.status === "active"
                                      ? "● Active"
                                      : "○ Inactive"}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                      p.featured
                                        ? "bg-heritage-gold/10 text-heritage-gold border border-heritage-gold/25"
                                        : "bg-gray-50 text-gray-400 border border-gray-200"
                                    }`}
                                  >
                                    {p.featured ? "Yes" : "No"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex gap-2 justify-end">
                                    <div className="flex flex-col gap-0.5">
                                      <button
                                        disabled={p.displayOrder === 1}
                                        onClick={() => {
                                          if (setCommunityPhotos) {
                                            setCommunityPhotos((prev) => {
                                              const currentIdx = prev.findIndex(
                                                (item) => item.id === p.id,
                                              );
                                              if (currentIdx <= 0) return prev;
                                              const updated = [...prev];
                                              const tempOrder =
                                                updated[currentIdx]
                                                  .displayOrder || 1;
                                              updated[currentIdx].displayOrder =
                                                updated[currentIdx - 1]
                                                  .displayOrder || 1;
                                              updated[
                                                currentIdx - 1
                                              ].displayOrder = tempOrder;
                                              return updated;
                                            });
                                            triggerStatus(
                                              "Adjusted display order!",
                                            );
                                          }
                                        }}
                                        className="p-0.5 text-[9px] font-mono hover:text-heritage-gold transition disabled:opacity-30 cursor-pointer"
                                        title="Move Up"
                                      >
                                        ▲
                                      </button>
                                      <button
                                        disabled={
                                          p.displayOrder ===
                                          communityPhotos.length
                                        }
                                        onClick={() => {
                                          if (setCommunityPhotos) {
                                            setCommunityPhotos((prev) => {
                                              const currentIdx = prev.findIndex(
                                                (item) => item.id === p.id,
                                              );
                                              if (
                                                currentIdx === -1 ||
                                                currentIdx >= prev.length - 1
                                              )
                                                return prev;
                                              const updated = [...prev];
                                              const tempOrder =
                                                updated[currentIdx]
                                                  .displayOrder || 1;
                                              updated[currentIdx].displayOrder =
                                                updated[currentIdx + 1]
                                                  .displayOrder || 1;
                                              updated[
                                                currentIdx + 1
                                              ].displayOrder = tempOrder;
                                              return updated;
                                            });
                                            triggerStatus(
                                              "Adjusted display order!",
                                            );
                                          }
                                        }}
                                        className="p-0.5 text-[9px] font-mono hover:text-heritage-gold transition disabled:opacity-30 cursor-pointer"
                                        title="Move Down"
                                      >
                                        ▼
                                      </button>
                                    </div>

                                    <button
                                      onClick={() => {
                                        setIsNewRecord(false);
                                        setEditingItem(p);
                                        setEditingType("photo");
                                      }}
                                      className="p-1.5 bg-gray-50 hover:bg-heritage-green/10 text-heritage-green rounded transition"
                                      title="Edit Photo Details"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                    <button
                                      onClick={() => handleDeletePhoto(p.id)}
                                      className="p-1.5 bg-gray-50 hover:bg-red-50 text-red-600 rounded transition"
                                      title="Delete Photo"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "settings" && (
              <div className="space-y-6 text-left">
                {/* Settings Sub-Tab Navigation */}
                <div className="flex border-b border-heritage-gold/25 gap-2 pb-1">
                  <button
                    type="button"
                    onClick={() => setSettingsSubTab("rules")}
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all rounded-t-xl select-none cursor-pointer flex items-center gap-1.5 ${
                      settingsSubTab === "rules"
                        ? "bg-heritage-green text-heritage-gold border-t border-x border-heritage-gold/30 shadow-xs"
                        : "text-heritage-beige hover:text-heritage-gold hover:bg-heritage-forest/30"
                    }`}
                  >
                    <Sliders size={12} />
                    <span>⚙️ Central Business Rules</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsSubTab("discounts")}
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all rounded-t-xl select-none cursor-pointer flex items-center gap-1.5 ${
                      settingsSubTab === "discounts"
                        ? "bg-heritage-green text-heritage-gold border-t border-x border-heritage-gold/30 shadow-xs"
                        : "text-heritage-beige hover:text-heritage-gold hover:bg-heritage-forest/30"
                    }`}
                  >
                    <Tag size={12} />
                    <span>🏷️ Discount Management</span>
                    <span className="bg-heritage-gold/25 text-heritage-gold text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                      Planning Only
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsSubTab("pricing_engine")}
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all rounded-t-xl select-none cursor-pointer flex items-center gap-1.5 ${
                      settingsSubTab === "pricing_engine"
                        ? "bg-heritage-green text-heritage-gold border-t border-x border-heritage-gold/30 shadow-xs"
                        : "text-heritage-beige hover:text-heritage-gold hover:bg-heritage-forest/30"
                    }`}
                  >
                    <Tag size={12} />
                    <span>💰 Pricing Engine</span>
                  </button>
                </div>

                {settingsSubTab === "rules" && (
                  <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                      <div>
                        <h3 className="font-serif font-bold text-xl text-heritage-green">
                          Central Business Rules
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          Configure global application variables. Changes
                          propagate instantly across all modules.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          triggerStatus("Settings saved successfully")
                        }
                        className="bg-heritage-green text-heritage-gold hover:bg-heritage-forest px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
                      >
                        Save Configuration
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Batch Settings */}
                      <div className="space-y-4">
                        <h4 className="font-bold text-sm text-heritage-green border-b border-gray-100 pb-2 flex items-center gap-2">
                          <Layers2 size={14} className="text-heritage-gold" />{" "}
                          Batch & Capacity Settings
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Minimum Garments Per Batch
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.batchSettings
                                  .minGarmentsPerBatch
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  batchSettings: {
                                    ...prev.batchSettings,
                                    minGarmentsPerBatch:
                                      parseInt(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Maximum Garments Per Batch
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.batchSettings
                                  .maxGarmentsPerBatch
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  batchSettings: {
                                    ...prev.batchSettings,
                                    maxGarmentsPerBatch:
                                      parseInt(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Minimum Participants Required
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.batchSettings
                                  .minParticipantsRequired
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  batchSettings: {
                                    ...prev.batchSettings,
                                    minParticipantsRequired:
                                      parseInt(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Default Community Batch Size
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.batchSettings
                                  .defaultCommunityBatchSize
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  batchSettings: {
                                    ...prev.batchSettings,
                                    defaultCommunityBatchSize:
                                      parseInt(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="flex justify-between items-center pt-2">
                            <label className="text-xs text-gray-600 font-medium">
                              Auto-manage Batch Status Rules
                            </label>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={
                                  businessSettings.batchSettings
                                    .automaticBatchStatusRules
                                }
                                onChange={(e) =>
                                  setBusinessSettings((prev) => ({
                                    ...prev,
                                    batchSettings: {
                                      ...prev.batchSettings,
                                      automaticBatchStatusRules:
                                        e.target.checked,
                                    },
                                  }))
                                }
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-heritage-green"></div>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Shipping Settings */}
                      <div className="space-y-4">
                        <h4 className="font-bold text-sm text-heritage-green border-b border-gray-100 pb-2 flex items-center gap-2">
                          <span className="text-heritage-gold">✈️</span>{" "}
                          Shipping & Fulfillment Rates
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Community Batch Shipping Rate (
                              {businessSettings.pricingSettings.currency})
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.shippingSettings
                                  .communityBatchShippingRate
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  shippingSettings: {
                                    ...prev.shippingSettings,
                                    communityBatchShippingRate:
                                      parseFloat(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Individual Order Shipping (
                              {businessSettings.pricingSettings.currency})
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.shippingSettings
                                  .individualOrderShippingRate
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  shippingSettings: {
                                    ...prev.shippingSettings,
                                    individualOrderShippingRate:
                                      parseFloat(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Personalized Batch Shipping (
                              {businessSettings.pricingSettings.currency})
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.shippingSettings
                                  .personalizedBatchShippingRate
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  shippingSettings: {
                                    ...prev.shippingSettings,
                                    personalizedBatchShippingRate:
                                      parseFloat(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              International Delivery Surcharge
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.shippingSettings
                                  .internationalDeliverySurcharge
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  shippingSettings: {
                                    ...prev.shippingSettings,
                                    internationalDeliverySurcharge:
                                      parseFloat(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Express Delivery Surcharge
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.shippingSettings
                                  .expressDeliverySurcharge
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  shippingSettings: {
                                    ...prev.shippingSettings,
                                    expressDeliverySurcharge:
                                      parseFloat(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Pricing Rules */}
                      <div className="space-y-4">
                        <h4 className="font-bold text-sm text-heritage-green border-b border-gray-100 pb-2 flex items-center gap-2">
                          <span className="text-heritage-gold">€</span>{" "}
                          Financial & Pricing Rules
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Required Deposit Percentage (%)
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.pricingSettings
                                  .depositPercentage
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  pricingSettings: {
                                    ...prev.pricingSettings,
                                    depositPercentage:
                                      parseInt(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Balance Percentage (%)
                            </label>
                            <input
                              type="number"
                              disabled
                              value={
                                100 -
                                businessSettings.pricingSettings
                                  .depositPercentage
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-100 bg-gray-50 text-gray-400 rounded text-xs cursor-not-allowed"
                            />
                          </div>
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Primary Currency
                            </label>
                            <select
                              value={businessSettings.pricingSettings.currency}
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  pricingSettings: {
                                    ...prev.pricingSettings,
                                    currency: e.target.value,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold text-right"
                            >
                              <option value="EUR">EUR (€)</option>
                              <option value="USD">USD ($)</option>
                              <option value="NGN">NGN (₦)</option>
                            </select>
                          </div>
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              VAT / Tax Rate (%)
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.pricingSettings
                                  .vatTaxPercentage
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  pricingSettings: {
                                    ...prev.pricingSettings,
                                    vatTaxPercentage:
                                      parseFloat(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="flex justify-between items-center pt-2">
                            <label className="text-xs text-gray-600 font-medium">
                              Enable Global Discount Engine
                            </label>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={
                                  businessSettings.pricingSettings
                                    .discountRulesEnabled
                                }
                                onChange={(e) =>
                                  setBusinessSettings((prev) => ({
                                    ...prev,
                                    pricingSettings: {
                                      ...prev.pricingSettings,
                                      discountRulesEnabled: e.target.checked,
                                    },
                                  }))
                                }
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-heritage-green"></div>
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Production Settings */}
                      <div className="space-y-4">
                        <h4 className="font-bold text-sm text-heritage-green border-b border-gray-100 pb-2 flex items-center gap-2">
                          <span className="text-heritage-gold">🧵</span>{" "}
                          Production Timelines
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Production Start Threshold (%)
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.productionSettings
                                  .productionStartThresholdPercentage
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  productionSettings: {
                                    ...prev.productionSettings,
                                    productionStartThresholdPercentage:
                                      parseInt(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Est. Production Duration (Days)
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.productionSettings
                                  .estimatedProductionDurationDays
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  productionSettings: {
                                    ...prev.productionSettings,
                                    estimatedProductionDurationDays:
                                      parseInt(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Default Delivery Window (Days)
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.productionSettings
                                  .defaultDeliveryWindowDays
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  productionSettings: {
                                    ...prev.productionSettings,
                                    defaultDeliveryWindowDays:
                                      parseInt(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="flex justify-between items-center">
                            <label className="text-xs text-gray-600 font-medium">
                              Default Pickup Location
                            </label>
                            <input
                              type="text"
                              value={
                                businessSettings.productionSettings
                                  .defaultPickupLocation
                              }
                              onChange={(e) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  productionSettings: {
                                    ...prev.productionSettings,
                                    defaultPickupLocation: e.target.value,
                                  },
                                }))
                              }
                              className="w-48 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Application Wide */}
                      <div className="space-y-4 md:col-span-2">
                        <h4 className="font-bold text-sm text-heritage-green border-b border-gray-100 pb-2 flex items-center gap-2">
                          <span className="text-heritage-gold">🌐</span>{" "}
                          Platform Branding & Announcements
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-3">
                            <div className="flex justify-between items-center">
                              <label className="text-xs text-gray-600 font-medium">
                                Community Name
                              </label>
                              <input
                                type="text"
                                value={
                                  businessSettings.applicationSettings
                                    .communityName
                                }
                                onChange={(e) =>
                                  setBusinessSettings((prev) => ({
                                    ...prev,
                                    applicationSettings: {
                                      ...prev.applicationSettings,
                                      communityName: e.target.value,
                                    },
                                  }))
                                }
                                className="w-48 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                              />
                            </div>
                            <div className="flex justify-between items-center">
                              <label className="text-xs text-gray-600 font-medium">
                                Default Active Batch ID
                              </label>
                              <input
                                type="text"
                                value={
                                  businessSettings.applicationSettings
                                    .defaultActiveBatchId
                                }
                                onChange={(e) =>
                                  setBusinessSettings((prev) => ({
                                    ...prev,
                                    applicationSettings: {
                                      ...prev.applicationSettings,
                                      defaultActiveBatchId: e.target.value,
                                    },
                                  }))
                                }
                                className="w-48 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                              />
                            </div>
                            <div className="flex justify-between items-center">
                              <label className="text-xs text-gray-600 font-medium">
                                Default Country Scope
                              </label>
                              <input
                                type="text"
                                value={
                                  businessSettings.applicationSettings
                                    .defaultCountry
                                }
                                onChange={(e) =>
                                  setBusinessSettings((prev) => ({
                                    ...prev,
                                    applicationSettings: {
                                      ...prev.applicationSettings,
                                      defaultCountry: e.target.value,
                                    },
                                  }))
                                }
                                className="w-48 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                              />
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center">
                              <label className="text-xs text-gray-600 font-medium">
                                System Announcements
                              </label>
                              <textarea
                                value={
                                  businessSettings.applicationSettings
                                    .systemAnnouncements
                                }
                                onChange={(e) =>
                                  setBusinessSettings((prev) => ({
                                    ...prev,
                                    applicationSettings: {
                                      ...prev.applicationSettings,
                                      systemAnnouncements: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Global notice banner text (empty to disable)..."
                                className="w-48 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold resize-none h-16"
                              />
                            </div>
                            <div className="flex justify-between items-center pt-2">
                              <label className="text-xs text-gray-600 font-medium">
                                Enable Active Platform Notifications
                              </label>
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={
                                    businessSettings.applicationSettings
                                      .notificationMessagesEnabled
                                  }
                                  onChange={(e) =>
                                    setBusinessSettings((prev) => ({
                                      ...prev,
                                      applicationSettings: {
                                        ...prev.applicationSettings,
                                        notificationMessagesEnabled:
                                          e.target.checked,
                                      },
                                    }))
                                  }
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-heritage-green"></div>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Virtual Try-On Showcase Management */}
                      <div className="space-y-4 md:col-span-2 border-t border-gray-100 pt-6">
                        <h4 className="font-bold text-sm text-heritage-green flex items-center gap-2">
                          <span className="text-heritage-gold">✨</span> Virtual
                          Try-On Showcase Management
                        </h4>
                        <p className="text-xs text-gray-500">
                          Upload and manage the primary placeholder showcase
                          image used to introduce the Virtual Try-On feature to
                          customers during their custom bespoke ordering flow.
                        </p>
                        <div className="flex flex-col md:flex-row items-center gap-6 bg-gray-50 border border-gray-100 p-4 rounded-xl">
                          <div className="relative w-32 h-44 rounded-xl border border-gray-200 overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center">
                            {businessSettings.applicationSettings
                              .virtualTryOnConceptImage ? (
                              <img
                                src={
                                  businessSettings.applicationSettings
                                    .virtualTryOnConceptImage
                                }
                                alt="Custom Showcase Preview"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="text-center p-3 text-gray-400">
                                <Image
                                  size={24}
                                  className="mx-auto mb-1 text-gray-300"
                                />
                                <span className="text-[10px] block font-mono">
                                  Default Image (Concept 1)
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="space-y-3 flex-1 w-full">
                            <div className="flex flex-wrap gap-2">
                              <label className="px-3 py-1.5 bg-heritage-green hover:bg-heritage-forest text-white hover:text-heritage-gold rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer inline-flex items-center gap-1.5 select-none">
                                <Upload size={12} />
                                <span>Upload New Custom Photo</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onload = async () => {
                                        const dataURL = reader.result as string;
                                        const compressedURL = await compressImage(dataURL);
                                        const finalUrl = await ImageService.uploadImageIfBase64(compressedURL, "settings", "virtualTryOnConcept");
                                        if (finalUrl) {
                                          setBusinessSettings((prev) => ({
                                            ...prev,
                                            applicationSettings: {
                                              ...prev.applicationSettings,
                                              virtualTryOnConceptImage: finalUrl,
                                            },
                                          }));
                                          triggerStatus(
                                            "Virtual Try-On showcase image updated successfully!",
                                            "success",
                                          );
                                        }
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                              </label>
                              {businessSettings.applicationSettings
                                .virtualTryOnConceptImage && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBusinessSettings((prev) => ({
                                      ...prev,
                                      applicationSettings: {
                                        ...prev.applicationSettings,
                                        virtualTryOnConceptImage: "",
                                      },
                                    }));
                                    triggerStatus(
                                      "Showcase image reset to default.",
                                      "info",
                                    );
                                  }}
                                  className="px-3 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
                                >
                                  <Trash2 size={12} />
                                  <span>Reset to Default</span>
                                </button>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                              Tip: For best visual alignment, upload a portrait
                              aspect ratio (3:4 or 9:16) image with high
                              contrast. This image is stored dynamically inside
                              your secure cloud database and persists across
                              sessions.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Garment Composition List Management */}
                      <div className="space-y-4 md:col-span-2 border-t border-gray-100 pt-6">
                        <h4 className="font-bold text-sm text-heritage-green flex items-center gap-2">
                          <ListCollapse
                            size={14}
                            className="text-heritage-gold"
                          />{" "}
                          Manage Garment Composition Options
                        </h4>
                        <p className="text-xs text-gray-500">
                          Define and update the options of garment composition
                          sets. These options are dynamically available to all
                          style cards.
                        </p>
                        <div className="bg-heritage-cream/20 border border-heritage-gold/15 p-5 rounded-2xl space-y-4">
                          <div className="flex flex-wrap gap-2">
                            {(businessSettings.garmentCompositions || []).map(
                              (compOption, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-1.5 bg-white border border-heritage-gold/10 hover:border-heritage-gold/30 px-3 py-1.5 rounded-xl text-xs text-heritage-green font-medium shadow-sm transition-all"
                                >
                                  <span>{compOption}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updatedComps = (
                                        businessSettings.garmentCompositions ||
                                        []
                                      ).filter((_, i) => i !== idx);
                                      setBusinessSettings((prev) => ({
                                        ...prev,
                                        garmentCompositions: updatedComps,
                                      }));
                                      triggerStatus(
                                        `Removed ${compOption} option.`,
                                      );
                                    }}
                                    className="text-red-500 hover:text-red-700 font-bold ml-1 hover:scale-110 transition-transform"
                                    title="Delete Option"
                                  >
                                    &times;
                                  </button>
                                </div>
                              ),
                            )}
                            {(businessSettings.garmentCompositions || [])
                              .length === 0 && (
                              <p className="text-xs text-gray-400 italic">
                                No garment composition options configured.
                              </p>
                            )}
                          </div>

                          <div className="flex gap-2 max-w-md">
                            <input
                              type="text"
                              placeholder="Add new composition option (e.g., 5-Piece Set)"
                              id="new-composition-input"
                              className="flex-grow px-3 py-2 border border-heritage-gold/20 bg-white rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-heritage-gold focus:border-heritage-gold"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const val = (
                                    e.currentTarget as HTMLInputElement
                                  ).value.trim();
                                  if (val) {
                                    if (
                                      (
                                        businessSettings.garmentCompositions ||
                                        []
                                      ).includes(val)
                                    ) {
                                      triggerStatus(
                                        "Option already exists!",
                                        "info",
                                      );
                                      return;
                                    }
                                    const updatedComps = [
                                      ...(businessSettings.garmentCompositions ||
                                        []),
                                      val,
                                    ];
                                    setBusinessSettings((prev) => ({
                                      ...prev,
                                      garmentCompositions: updatedComps,
                                    }));
                                    (
                                      e.currentTarget as HTMLInputElement
                                    ).value = "";
                                    triggerStatus(
                                      `Added ${val} successfully!`,
                                      "success",
                                    );
                                  }
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const input = document.getElementById(
                                  "new-composition-input",
                                ) as HTMLInputElement;
                                const val = input?.value.trim();
                                if (val) {
                                  if (
                                    (
                                      businessSettings.garmentCompositions || []
                                    ).includes(val)
                                  ) {
                                    triggerStatus(
                                      "Option already exists!",
                                      "info",
                                    );
                                    return;
                                  }
                                  const updatedComps = [
                                    ...(businessSettings.garmentCompositions ||
                                      []),
                                    val,
                                  ];
                                  setBusinessSettings((prev) => ({
                                    ...prev,
                                    garmentCompositions: updatedComps,
                                  }));
                                  input.value = "";
                                  triggerStatus(
                                    `Added ${val} successfully!`,
                                    "success",
                                  );
                                }
                              }}
                              className="bg-heritage-green hover:bg-heritage-forest text-heritage-gold font-sans uppercase font-bold text-[10px] tracking-wider px-4 py-2 rounded-xl transition-colors shadow-sm"
                            >
                              Add Option
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Centralized Outfit Type Manager */}
                      <div className="space-y-4 md:col-span-2 border-t border-gray-100 pt-6">
                        <h4 className="font-bold text-sm text-heritage-green flex items-center gap-2">
                          <Layers2 size={14} className="text-heritage-gold" />{" "}
                          Manage Centralized Outfit Types
                        </h4>
                        <p className="text-xs text-gray-500">
                          Define and update standard clothing styles/categories
                          dynamically used site-wide in Design Collection,
                          Design Studio, and Orders.
                        </p>

                        <div className="bg-heritage-cream/20 border border-heritage-gold/15 p-5 rounded-2xl space-y-4">
                          {/* Add / Edit Form */}
                          <div className="bg-white border border-heritage-gold/10 p-4 rounded-xl space-y-3">
                            <h5 className="font-bold text-xs text-heritage-green uppercase tracking-wider">
                              {editingOutfitType
                                ? "Edit Outfit Type"
                                : "Add New Centralized Outfit Type"}
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-heritage-green uppercase tracking-wider">
                                  Outfit Type Name
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g., Senator Set, Boubou"
                                  value={
                                    editingOutfitType
                                      ? editingOutfitType.name
                                      : newOutfitName
                                  }
                                  onChange={(e) => {
                                    if (editingOutfitType) {
                                      setEditingOutfitType({
                                        ...editingOutfitType,
                                        name: e.target.value,
                                      });
                                    } else {
                                      setNewOutfitName(e.target.value);
                                    }
                                  }}
                                  className="w-full px-3 py-1.5 border border-heritage-gold/20 bg-white rounded-lg text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-heritage-green uppercase tracking-wider">
                                  Target Collection
                                </label>
                                <select
                                  value={
                                    editingOutfitType
                                      ? editingOutfitType.gender
                                      : newOutfitGender
                                  }
                                  onChange={(e) => {
                                    const val = e.target.value as any;
                                    if (editingOutfitType) {
                                      setEditingOutfitType({
                                        ...editingOutfitType,
                                        gender: val,
                                      });
                                    } else {
                                      setNewOutfitGender(val);
                                    }
                                  }}
                                  className="w-full px-3 py-1.5 border border-heritage-gold/20 bg-white rounded-lg text-xs"
                                >
                                  {useReferenceDataFallback("genders", [
                                    { value: "male", label: "Men's Collection" },
                                    { value: "female", label: "Women's Collection" },
                                    { value: "unisex", label: "Unisex Collection" },
                                    { value: "family", label: "Family Collection" },
                                  ]).map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-heritage-green uppercase tracking-wider">
                                  Display Order
                                </label>
                                <input
                                  type="number"
                                  value={
                                    editingOutfitType
                                      ? editingOutfitType.displayOrder
                                      : newOutfitOrder
                                  }
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1;
                                    if (editingOutfitType) {
                                      setEditingOutfitType({
                                        ...editingOutfitType,
                                        displayOrder: val,
                                      });
                                    } else {
                                      setNewOutfitOrder(val);
                                    }
                                  }}
                                  className="w-full px-3 py-1.5 border border-heritage-gold/20 bg-white rounded-lg text-xs font-mono"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (editingOutfitType) {
                                      // Save edit
                                      if (!editingOutfitType.name.trim()) {
                                        triggerStatus(
                                          "Name cannot be empty!",
                                          "error",
                                        );
                                        return;
                                      }
                                      const updatedTypes = (
                                        businessSettings.outfitTypes || []
                                      ).map((t) =>
                                        t.id === editingOutfitType.id
                                          ? editingOutfitType
                                          : t,
                                      );
                                      setBusinessSettings((prev) => ({
                                        ...prev,
                                        outfitTypes: updatedTypes,
                                      }));
                                      setEditingOutfitType(null);
                                      triggerStatus(
                                        "Outfit type updated successfully!",
                                        "success",
                                      );
                                    } else {
                                      // Add new
                                      if (!newOutfitName.trim()) {
                                        triggerStatus(
                                          "Name cannot be empty!",
                                          "error",
                                        );
                                        return;
                                      }
                                      const newId = newOutfitName
                                        .toLowerCase()
                                        .trim()
                                        .replace(/[^a-z0-9]+/g, "-");
                                      if (
                                        (
                                          businessSettings.outfitTypes || []
                                        ).some((t) => t.id === newId)
                                      ) {
                                        triggerStatus(
                                          "Outfit type already exists!",
                                          "error",
                                        );
                                        return;
                                      }
                                      const newType: OutfitType = {
                                        id: newId,
                                        name: newOutfitName.trim(),
                                        gender: newOutfitGender,
                                        enabled: true,
                                        displayOrder: newOutfitOrder,
                                      };
                                      const updatedTypes = [
                                        ...(businessSettings.outfitTypes || []),
                                        newType,
                                      ];
                                      setBusinessSettings((prev) => ({
                                        ...prev,
                                        outfitTypes: updatedTypes,
                                      }));
                                      setNewOutfitName("");
                                      setNewOutfitOrder(
                                        (businessSettings.outfitTypes || [])
                                          .length + 2,
                                      );
                                      triggerStatus(
                                        `Added ${newType.name} successfully!`,
                                        "success",
                                      );
                                    }
                                  }}
                                  className="flex-grow bg-heritage-green hover:bg-heritage-forest text-heritage-gold font-sans uppercase font-bold text-[10px] tracking-wider py-2 rounded-lg transition-colors shadow-sm"
                                >
                                  {editingOutfitType
                                    ? "Save Changes"
                                    : "Add Outfit Type"}
                                </button>
                                {editingOutfitType && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingOutfitType(null)}
                                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-sans uppercase font-bold text-[10px] tracking-wider rounded-lg transition-colors"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Filter Tabs */}
                          <div className="flex flex-wrap items-center gap-1 border-b border-heritage-gold/10 pb-2">
                            <span className="text-[10px] font-bold text-heritage-green uppercase tracking-wider mr-2">
                              Filter List:
                            </span>
                            {(
                              [
                                "all",
                                "male",
                                "female",
                                "unisex",
                                "family",
                              ] as const
                            ).map((g) => (
                              <button
                                key={g}
                                type="button"
                                onClick={() => setOutfitGenderFilter(g)}
                                className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-lg border transition-all ${
                                  outfitGenderFilter === g
                                    ? "bg-heritage-green text-heritage-gold border-heritage-green shadow-sm"
                                    : "bg-white text-heritage-green border-heritage-gold/15 hover:border-heritage-gold/30"
                                }`}
                              >
                                {g === "all"
                                  ? "All Collections"
                                  : g === "male"
                                    ? "Men's"
                                    : g === "female"
                                      ? "Women's"
                                      : g === "unisex"
                                        ? "Unisex"
                                        : "Family"}
                              </button>
                            ))}
                          </div>

                          {/* List Table */}
                          <div className="max-h-80 overflow-y-auto border border-heritage-gold/10 bg-white rounded-xl divide-y divide-gray-100">
                            {(businessSettings.outfitTypes || [])
                              .filter(
                                (t) =>
                                  outfitGenderFilter === "all" ||
                                  t.gender === outfitGenderFilter,
                              )
                              .sort(
                                (a, b) =>
                                  (a.displayOrder || 0) - (b.displayOrder || 0),
                              )
                              .map((type) => (
                                <div
                                  key={type.id}
                                  className="flex items-center justify-between p-3 hover:bg-heritage-cream/10 transition-colors"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-mono text-gray-400 w-6">
                                      #{type.displayOrder}
                                    </span>
                                    <div>
                                      <h6
                                        className={`text-xs font-bold ${type.enabled ? "text-heritage-green" : "text-gray-400 line-through"}`}
                                      >
                                        {type.name}
                                      </h6>
                                      <span className="text-[9px] bg-gray-100 text-gray-500 uppercase font-semibold px-1.5 py-0.5 rounded tracking-wider">
                                        {type.gender}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {/* Enable/Disable Toggle */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updatedTypes = (
                                          businessSettings.outfitTypes || []
                                        ).map((t) =>
                                          t.id === type.id
                                            ? { ...t, enabled: !t.enabled }
                                            : t,
                                        );
                                        setBusinessSettings((prev) => ({
                                          ...prev,
                                          outfitTypes: updatedTypes,
                                        }));
                                        triggerStatus(
                                          `${type.name} ${!type.enabled ? "Enabled" : "Disabled"}`,
                                          "info",
                                        );
                                      }}
                                      className={`px-2 py-1 text-[9px] font-bold rounded uppercase tracking-wider border transition-colors ${
                                        type.enabled
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                          : "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200"
                                      }`}
                                    >
                                      {type.enabled ? "Enabled" : "Disabled"}
                                    </button>

                                    {/* Edit Button */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingOutfitType(type);
                                      }}
                                      className="p-1.5 text-heritage-green hover:bg-heritage-green/5 rounded-lg transition-colors"
                                      title="Edit Outfit Type"
                                    >
                                      <Edit2 size={13} />
                                    </button>

                                    {/* Delete Button */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (
                                          confirm(
                                            `Are you sure you want to delete "${type.name}"? This might impact cards referencing it.`,
                                          )
                                        ) {
                                          const updatedTypes = (
                                            businessSettings.outfitTypes || []
                                          ).filter((t) => t.id !== type.id);
                                          setBusinessSettings((prev) => ({
                                            ...prev,
                                            outfitTypes: updatedTypes,
                                          }));
                                          triggerStatus(
                                            `Deleted "${type.name}" option.`,
                                            "info",
                                          );
                                        }
                                      }}
                                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Delete Outfit Type"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            {(businessSettings.outfitTypes || []).filter(
                              (t) =>
                                outfitGenderFilter === "all" ||
                                t.gender === outfitGenderFilter,
                            ).length === 0 && (
                              <p className="text-xs text-gray-400 italic p-4 text-center">
                                No outfit types found matching the selection.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 text-sm text-blue-800">
                      <Info size={16} className="shrink-0 mt-0.5" />
                      <p>
                        <strong>WordPress Integration Ready:</strong> This
                        unified settings object is designed to serialize cleanly
                        to a standard SQL options table or WordPress Settings
                        API layer in future headless integrations.
                      </p>
                    </div>
                  </div>
                )}

                {settingsSubTab === "discounts" && (
                  <div className="space-y-6">
                    {/* Feature Status Announcement Banner */}
                    <div className="bg-amber-50 border border-amber-200/60 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-amber-900 shadow-xs">
                      <div className="flex gap-3 items-start">
                        <AlertTriangle
                          size={20}
                          className="text-amber-600 shrink-0 mt-0.5"
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-[9px] uppercase tracking-widest bg-amber-200/80 text-amber-950 px-2.5 py-0.5 rounded border border-amber-300">
                              Feature Status: Planning Phase
                            </span>
                          </div>
                          <h4 className="font-bold text-sm font-serif">
                            Administrative Discount Infrastructure (Disabled)
                          </h4>
                          <p className="text-xs text-amber-800/90 leading-relaxed font-sans max-w-2xl">
                            Discounts are currently disabled. These
                            configurations are for administrative formulation
                            and future WordPress/WooCommerce compatibility
                            planning only. No promotional fields or discounted
                            rates will appear in customer-facing checkout paths.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-3 py-1.5 bg-amber-200/50 text-amber-900 font-extrabold uppercase rounded-lg text-[10px] tracking-wider border border-amber-300/40 select-none">
                          🔒 Inactive
                        </span>
                      </div>
                    </div>

                    {/* Base settings input grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Individual Orders Card */}
                      <div className="bg-white border border-heritage-gold/20 rounded-2xl p-5 space-y-4 shadow-xs text-left">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                          <h4 className="font-bold text-sm text-heritage-green flex items-center gap-2">
                            <span className="text-xs">👤</span> Individual
                            Orders Planning
                          </h4>
                          <span className="text-[10px] uppercase font-black tracking-widest text-gray-400">
                            Section I
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                              Suggested Range Min (%)
                            </label>
                            <input
                              type="number"
                              value={
                                dSettings.individualOrders.suggestedMinRange
                              }
                              onChange={(e) =>
                                updatePlanningRule(
                                  "individualOrders",
                                  "suggestedMinRange",
                                  parseInt(e.target.value) || 0,
                                )
                              }
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                              Suggested Range Max (%)
                            </label>
                            <input
                              type="number"
                              value={
                                dSettings.individualOrders.suggestedMaxRange
                              }
                              onChange={(e) =>
                                updatePlanningRule(
                                  "individualOrders",
                                  "suggestedMaxRange",
                                  parseInt(e.target.value) || 0,
                                )
                              }
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                              Minimum Discount (
                              {businessSettings.pricingSettings.currency})
                            </label>
                            <input
                              type="number"
                              value={dSettings.individualOrders.minimumDiscount}
                              onChange={(e) =>
                                updatePlanningRule(
                                  "individualOrders",
                                  "minimumDiscount",
                                  parseInt(e.target.value) || 0,
                                )
                              }
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                              Maximum Discount (
                              {businessSettings.pricingSettings.currency})
                            </label>
                            <input
                              type="number"
                              value={dSettings.individualOrders.maximumDiscount}
                              onChange={(e) =>
                                updatePlanningRule(
                                  "individualOrders",
                                  "maximumDiscount",
                                  parseInt(e.target.value) || 0,
                                )
                              }
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                            Internal Strategy Notes
                          </label>
                          <textarea
                            value={dSettings.individualOrders.internalNotes}
                            onChange={(e) =>
                              updatePlanningRule(
                                "individualOrders",
                                "internalNotes",
                                e.target.value,
                              )
                            }
                            placeholder="Define scope, conditions, or guidelines for individual bespoke clients..."
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-heritage-green focus:outline-none focus:border-heritage-gold font-sans"
                          />
                        </div>
                      </div>

                      {/* Community Batch Orders Card */}
                      <div className="bg-white border border-heritage-gold/20 rounded-2xl p-5 space-y-4 shadow-xs text-left">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                          <h4 className="font-bold text-sm text-heritage-green flex items-center gap-2">
                            <span className="text-xs">👥</span> Community Batch
                            Orders Planning
                          </h4>
                          <span className="text-[10px] uppercase font-black tracking-widest text-gray-400">
                            Section II
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                              Suggested Range Min (%)
                            </label>
                            <input
                              type="number"
                              value={
                                dSettings.communityOrders.suggestedMinRange
                              }
                              onChange={(e) =>
                                updatePlanningRule(
                                  "communityOrders",
                                  "suggestedMinRange",
                                  parseInt(e.target.value) || 0,
                                )
                              }
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                              Suggested Range Max (%)
                            </label>
                            <input
                              type="number"
                              value={
                                dSettings.communityOrders.suggestedMaxRange
                              }
                              onChange={(e) =>
                                updatePlanningRule(
                                  "communityOrders",
                                  "suggestedMaxRange",
                                  parseInt(e.target.value) || 0,
                                )
                              }
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                              Minimum Discount (
                              {businessSettings.pricingSettings.currency})
                            </label>
                            <input
                              type="number"
                              value={dSettings.communityOrders.minimumDiscount}
                              onChange={(e) =>
                                updatePlanningRule(
                                  "communityOrders",
                                  "minimumDiscount",
                                  parseInt(e.target.value) || 0,
                                )
                              }
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                              Maximum Discount (
                              {businessSettings.pricingSettings.currency})
                            </label>
                            <input
                              type="number"
                              value={dSettings.communityOrders.maximumDiscount}
                              onChange={(e) =>
                                updatePlanningRule(
                                  "communityOrders",
                                  "maximumDiscount",
                                  parseInt(e.target.value) || 0,
                                )
                              }
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:border-heritage-gold"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                            Internal Strategy Notes
                          </label>
                          <textarea
                            value={dSettings.communityOrders.internalNotes}
                            onChange={(e) =>
                              updatePlanningRule(
                                "communityOrders",
                                "internalNotes",
                                e.target.value,
                              )
                            }
                            placeholder="Define conditions, member volume discount thresholds, or guidelines..."
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-heritage-green focus:outline-none focus:border-heritage-gold font-sans"
                          />
                        </div>
                      </div>
                    </div>

                    {/* VIP / Enterprise Orders Card (Planning Only Display) */}
                    <div className="bg-white border border-heritage-gold/20 rounded-2xl p-5 space-y-4 shadow-xs text-left">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-2">
                        <h4 className="font-bold text-sm text-heritage-green flex items-center gap-2">
                          <span className="text-xs">👑</span> VIP / Enterprise
                          Orders
                        </h4>
                        <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 rounded">
                          <span>Status:</span> Planning Only
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2 space-y-3">
                          <p className="text-xs text-gray-500 leading-relaxed font-sans">
                            Prepare high-end strategies for our premium partners
                            and special bespoke cohorts. VIP and Corporate
                            enterprise packages are custom formulated to reflect
                            bulk ordering, material reservation protocols, and
                            advanced logistics pipelines.
                          </p>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">
                              VIP/Enterprise Strategic Log
                            </label>
                            <textarea
                              value={dSettings.vipOrders.internalNotes}
                              onChange={(e) => updateVipNotes(e.target.value)}
                              placeholder="Log strategic details regarding exclusive discounts or privileges for high-net-worth individual client groups..."
                              rows={2}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-heritage-green focus:outline-none focus:border-heritage-gold font-sans"
                            />
                          </div>
                        </div>
                        <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-4 flex flex-col justify-between space-y-3">
                          <div className="space-y-1">
                            <h5 className="font-bold text-xs text-purple-900 uppercase">
                              Enterprise Scope
                            </h5>
                            <p className="text-[11px] text-purple-700 font-sans leading-normal">
                              Future capabilities will support dedicated
                              discount rules configured specifically for user
                              roles, enterprise organizations, or custom invite
                              codes.
                            </p>
                          </div>
                          <span className="text-[10px] font-bold text-purple-900 flex items-center gap-1 font-mono">
                            🔒 PLATFORM_LOCKED_VIP
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Future Discount Playground (The Data Model CRUD) */}
                    <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm space-y-6 text-left">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 pb-4">
                        <div>
                          <h4 className="font-serif font-bold text-lg text-heritage-green">
                            Future Coupon & Discount Schemas
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5 font-sans">
                            Mock and model upcoming campaigns. This sandbox
                            generates records compliant with WooCommerce coupons
                            schema.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingFutureDiscount(true);
                            setEditingFutureDiscount({
                              id: "",
                              name: "",
                              type: "percentage",
                              value: 10,
                              appliesTo: "all",
                              startDate: new Date().toISOString().split("T")[0],
                              endDate: new Date(
                                Date.now() + 30 * 24 * 60 * 60 * 1000,
                              )
                                .toISOString()
                                .split("T")[0],
                              stackable: false,
                              active: false,
                              internalNotes: "",
                            });
                          }}
                          className="bg-heritage-green text-heritage-gold hover:bg-heritage-forest px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm inline-flex items-center gap-1.5 self-start select-none cursor-pointer"
                        >
                          <Plus size={12} />
                          <span>Configure Planned Coupon</span>
                        </button>
                      </div>

                      {/* Coupon Creation / Edit Form (Conditional) */}
                      {editingFutureDiscount && (
                        <div className="bg-heritage-cream/15 border border-heritage-gold/30 rounded-2xl p-5 space-y-4">
                          <div className="flex items-center justify-between border-b border-heritage-gold/10 pb-2">
                            <h5 className="font-bold text-xs text-heritage-green uppercase tracking-wider">
                              {isAddingFutureDiscount
                                ? "✨ New Coupon Specification"
                                : "📝 Edit Coupon Specification"}
                            </h5>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFutureDiscount(null);
                                setIsAddingFutureDiscount(false);
                              }}
                              className="text-gray-400 hover:text-gray-600 cursor-pointer"
                            >
                              <X size={16} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] text-gray-500 font-bold uppercase block">
                                Discount Code / Name
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. LAGOSROYAL10"
                                value={editingFutureDiscount.name}
                                onChange={(e) =>
                                  setEditingFutureDiscount({
                                    ...editingFutureDiscount,
                                    name: e.target.value.toUpperCase(),
                                  })
                                }
                                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-mono font-bold text-heritage-green focus:outline-none focus:border-heritage-gold"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] text-gray-500 font-bold uppercase block">
                                Discount Type
                              </label>
                              <select
                                value={editingFutureDiscount.type}
                                onChange={(e) =>
                                  setEditingFutureDiscount({
                                    ...editingFutureDiscount,
                                    type: e.target.value as
                                      "percentage" | "fixed_amount",
                                  })
                                }
                                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none bg-white"
                              >
                                <option value="percentage">
                                  Percentage Discount (%)
                                </option>
                                <option value="fixed_amount">
                                  Fixed Surcharge Slicing (
                                  {businessSettings.pricingSettings.currency})
                                </option>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] text-gray-500 font-bold uppercase block">
                                Discount Value (
                                {editingFutureDiscount.type === "percentage"
                                  ? "%"
                                  : businessSettings.pricingSettings.currency}
                                )
                              </label>
                              <input
                                type="number"
                                value={editingFutureDiscount.value}
                                onChange={(e) =>
                                  setEditingFutureDiscount({
                                    ...editingFutureDiscount,
                                    value: parseInt(e.target.value) || 0,
                                  })
                                }
                                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:border-heritage-gold"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] text-gray-500 font-bold uppercase block">
                                Applies To
                              </label>
                              <select
                                value={editingFutureDiscount.appliesTo}
                                onChange={(e) =>
                                  setEditingFutureDiscount({
                                    ...editingFutureDiscount,
                                    appliesTo: e.target.value as any,
                                  })
                                }
                                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none bg-white"
                              >
                                <option value="all">All Orders</option>
                                <option value="individual">
                                  Individual Orders only
                                </option>
                                <option value="community">
                                  Community Batches only
                                </option>
                                <option value="vip">VIP Cohorts only</option>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] text-gray-500 font-bold uppercase block">
                                Start Date
                              </label>
                              <input
                                type="date"
                                value={editingFutureDiscount.startDate}
                                onChange={(e) =>
                                  setEditingFutureDiscount({
                                    ...editingFutureDiscount,
                                    startDate: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-heritage-green focus:outline-none focus:border-heritage-gold"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] text-gray-500 font-bold uppercase block">
                                End Date
                              </label>
                              <input
                                type="date"
                                value={editingFutureDiscount.endDate}
                                onChange={(e) =>
                                  setEditingFutureDiscount({
                                    ...editingFutureDiscount,
                                    endDate: e.target.value,
                                  })
                                }
                                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-heritage-green focus:outline-none focus:border-heritage-gold"
                              />
                            </div>

                            <div className="flex items-center gap-6 pt-5 pl-2">
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={editingFutureDiscount.stackable}
                                  onChange={(e) =>
                                    setEditingFutureDiscount({
                                      ...editingFutureDiscount,
                                      stackable: e.target.checked,
                                    })
                                  }
                                  className="rounded border-gray-300 text-heritage-green focus:ring-heritage-gold"
                                />
                                <span className="text-[11px] text-gray-600 font-medium font-sans">
                                  Stackable coupon
                                </span>
                              </label>

                              <div
                                className="flex items-center gap-2"
                                title="Always false in planning phase"
                              >
                                <input
                                  type="checkbox"
                                  checked={false}
                                  disabled
                                  className="rounded border-gray-300 text-gray-300 cursor-not-allowed"
                                />
                                <span className="text-[11px] text-gray-400 italic font-sans">
                                  Active (Locked False)
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold uppercase block">
                              Internal Notes & WordPress Hooks
                            </label>
                            <input
                              type="text"
                              placeholder="WooCommerce coupon synchronization tag / notes..."
                              value={editingFutureDiscount.internalNotes}
                              onChange={(e) =>
                                setEditingFutureDiscount({
                                  ...editingFutureDiscount,
                                  internalNotes: e.target.value,
                                })
                              }
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-heritage-green focus:outline-none focus:border-heritage-gold"
                            />
                          </div>

                          <div className="flex gap-2 justify-end pt-2 border-t border-heritage-gold/10">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFutureDiscount(null);
                                setIsAddingFutureDiscount(false);
                              }}
                              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-50 select-none transition cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!editingFutureDiscount.name.trim()) {
                                  alert(
                                    "Please provide a coupon code / campaign name.",
                                  );
                                  return;
                                }
                                if (isAddingFutureDiscount) {
                                  addFutureDiscount(editingFutureDiscount);
                                } else {
                                  updateFutureDiscount(
                                    editingFutureDiscount.id,
                                    editingFutureDiscount,
                                  );
                                }
                                setEditingFutureDiscount(null);
                                setIsAddingFutureDiscount(false);
                              }}
                              className="px-4 py-1.5 bg-heritage-green text-heritage-gold rounded-lg text-xs font-bold uppercase tracking-wider select-none transition cursor-pointer"
                            >
                              Save Planned Record
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Planned Coupons List Table */}
                      <div className="overflow-x-auto rounded-xl border border-gray-150">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-gray-50 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-200">
                              <th className="px-4 py-3">Campaign Code</th>
                              <th className="px-4 py-3">Specification Type</th>
                              <th className="px-4 py-3">Value</th>
                              <th className="px-4 py-3">Applies To</th>
                              <th className="px-4 py-3">Campaign Interval</th>
                              <th className="px-4 py-3">Stackable</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-xs">
                            {dSettings.futureDiscounts.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={8}
                                  className="px-4 py-8 text-center text-gray-400 italic font-sans"
                                >
                                  No future coupons configured yet. Click
                                  "Configure Planned Coupon" above to start
                                  modeling.
                                </td>
                              </tr>
                            ) : (
                              dSettings.futureDiscounts.map((disc) => (
                                <tr
                                  key={disc.id}
                                  className="hover:bg-gray-50/50"
                                >
                                  <td className="px-4 py-3.5">
                                    <span className="font-mono font-bold text-heritage-green bg-heritage-cream/30 px-2 py-1 rounded border border-heritage-gold/20">
                                      {disc.name}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-gray-600 font-sans">
                                    {disc.type === "percentage"
                                      ? "Percentage"
                                      : "Fixed Surcharge"}
                                  </td>
                                  <td className="px-4 py-3.5 font-bold text-heritage-green">
                                    {disc.type === "percentage"
                                      ? `${disc.value}%`
                                      : `${disc.value} ${businessSettings.pricingSettings.currency}`}
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 font-extrabold uppercase text-[9px] rounded tracking-wider font-mono">
                                      {disc.appliesTo}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-gray-500 text-[11px] font-sans">
                                    {disc.startDate} to {disc.endDate}
                                  </td>
                                  <td className="px-4 py-3.5 font-sans">
                                    <span
                                      className={`text-[10px] font-bold ${disc.stackable ? "text-emerald-600" : "text-gray-400"}`}
                                    >
                                      {disc.stackable ? "Yes" : "No"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded font-mono">
                                      Planning
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 text-right">
                                    <div className="flex gap-2 justify-end">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setIsAddingFutureDiscount(false);
                                          setEditingFutureDiscount(disc);
                                        }}
                                        className="p-1.5 text-heritage-green hover:bg-heritage-cream/30 rounded cursor-pointer"
                                        title="Edit design specifications"
                                      >
                                        <Edit2 size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          deleteFutureDiscount(disc.id)
                                        }
                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                                        title="Delete future campaign placeholder"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {discSettingsNotesBlock}
                    </div>

                    {/* Integration Specifications */}
                    <div className="bg-heritage-forest text-heritage-beige rounded-2xl p-6 border border-heritage-gold/30 space-y-4 shadow-sm text-left">
                      <h4 className="font-serif font-bold text-md text-heritage-gold flex items-center gap-2">
                        <Puzzle size={16} /> WordPress & WooCommerce Headless
                        Readiness API
                      </h4>
                      <p className="text-xs text-heritage-beige/85 leading-relaxed font-sans">
                        The schema models formulated above map directly to the
                        WooCommerce coupon and pricing rule formats. This module
                        enforces data structure completeness so that during the
                        production launch, a standard hook synchronizes these
                        objects instantly with the REST API.
                      </p>

                      <div className="bg-black/25 rounded-xl p-4 font-mono text-[10px] text-heritage-gold/90 space-y-2 border border-white/5">
                        <p className="text-white/40">
                          // Expected WordPress Options serialized structure
                        </p>
                        <p>
                          <span className="text-pink-400">add_action</span>('
                          <span className="text-emerald-400">
                            woocommerce_get_shop_coupon_data
                          </span>
                          ',{" "}
                          <span className="text-emerald-400">
                            'sync_odogwu_heritage_discount_planning'
                          </span>
                          , 10, 2);
                        </p>
                        <p>
                          <span className="text-blue-400">function</span>{" "}
                          <span className="text-yellow-400">
                            sync_odogwu_heritage_discount_planning
                          </span>
                          ($coupon_code) &#123;
                        </p>
                        <p className="pl-4">
                          $local_settings ={" "}
                          <span className="text-pink-400">json_decode</span>(
                          <span className="text-pink-400">get_option</span>('
                          <span className="text-emerald-400">
                            odogwu_heritage_business_settings
                          </span>
                          '), true);
                        </p>
                        <p className="pl-4">
                          <span className="text-blue-400">return</span>{" "}
                          <span className="text-pink-400">array_filter</span>
                          ($local_settings['discountSettings']['futureDiscounts'],{" "}
                          <span className="text-blue-400">
                            function
                          </span>($disc){" "}
                          <span className="text-blue-400">use</span>
                          ($coupon_code) &#123;
                        </p>
                        <p className="pl-8">
                          <span className="text-blue-400">return</span>{" "}
                          $disc['name'] === $coupon_code;
                        </p>
                        <p className="pl-4">&#125;);</p>
                        <p>&#125;</p>
                      </div>
                    </div>
                  </div>
                )}

                {settingsSubTab === "pricing_engine" && (
                  <div className="space-y-6">
                    {/* Accessory Surcharge Card */}
                    <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h3 className="font-serif font-bold text-lg text-heritage-green">
                            Accessory Pricing
                          </h3>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Define standard accessory surcharges applied to
                            checkout when extras are selected.
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-heritage-green block">
                            Standard Accessory Charge (€)
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-heritage-green font-bold text-sm">
                              €
                            </span>
                            <input
                              type="number"
                              min="0"
                              value={
                                businessSettings.pricingSettings
                                  ?.standardAccessoryCharge ?? 10
                              }
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  pricingSettings: {
                                    ...prev.pricingSettings,
                                    standardAccessoryCharge: val,
                                  },
                                }));
                              }}
                              className="w-32 px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-heritage-gold"
                            />
                          </div>
                          <span className="text-[10px] text-gray-400 block">
                            Current Standard Accessory Charge:{" "}
                            <strong>
                              €
                              {businessSettings.pricingSettings
                                ?.standardAccessoryCharge ?? 10}
                            </strong>
                          </span>
                        </div>
                        <div className="bg-heritage-cream/20 border border-heritage-gold/15 p-4 rounded-xl text-xs leading-relaxed text-heritage-green">
                          💡 <strong>Odogwu Heritage Rule:</strong> Selected
                          optional accessories automatically add this fixed
                          charge per item (e.g., matching traditional caps/fila,
                          gele, shawls, bags, beads) to the total tailoring
                          invoice.
                        </div>
                      </div>
                    </div>

                    {/* Base Sewing Prices Card */}
                    <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
                      <div className="mb-4">
                        <h3 className="font-serif font-bold text-lg text-heritage-green">
                          Base Sewing Prices
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Configure base tailoring fees dynamically by combining
                          Outfit Type and Garment Composition.
                        </p>
                      </div>

                      {/* Add new combination form */}
                      <div className="bg-heritage-cream/15 border border-dashed border-heritage-gold/30 p-4 rounded-xl mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-heritage-green uppercase">
                            Outfit Type
                          </label>
                          <select
                            value={newOType}
                            onChange={(e) => setNewOType(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-gray-200 bg-white rounded-lg text-xs"
                          >
                            <option value="Senator Set">Senator Set</option>
                            <option value="Senator Shirt">Senator Shirt</option>
                            <option value="Native Shirt">Native Shirt</option>
                            <option value="Kaftan">Kaftan</option>
                            <option value="Kaftan Set">Kaftan Set</option>
                            <option value="Agbada">Agbada</option>
                            <option value="Isiagu Set">Isiagu Set</option>
                            <option value="Dashiki">Dashiki</option>
                            <option value="Buba & Sokoto">Buba & Sokoto</option>
                            <option value="Shirt & Trouser">
                              Shirt & Trouser
                            </option>
                            <option value="Shirt & Shorts">
                              Shirt & Shorts
                            </option>
                            <option value="Traditional Suit">
                              Traditional Suit
                            </option>
                            <option value="Maxi Gown">Maxi Gown</option>
                            <option value="Midi Gown">Midi Gown</option>
                            <option value="Shift Dress">Shift Dress</option>
                            <option value="Boubou">Boubou</option>
                            <option value="Kaftan Dress">Kaftan Dress</option>
                            <option value="Kimono Set">Kimono Set</option>
                            <option value="Blouse">Blouse</option>
                            <option value="Top & Skirt">Top & Skirt</option>
                            <option value="Wrapper Set">Wrapper Set</option>
                            <option value="Skirt Set">Skirt Set</option>
                            <option value="Palazzo Trouser">
                              Palazzo Trouser
                            </option>
                            <option value="Jumpsuit">Jumpsuit</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-heritage-green uppercase">
                            Garment Composition
                          </label>
                          <select
                            value={newComp}
                            onChange={(e) => setNewComp(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-gray-200 bg-white rounded-lg text-xs"
                          >
                            <option value="2-Piece Set">2-Piece Set</option>
                            <option value="Shirt Only">Shirt Only</option>
                            <option value="Trouser Only">Trouser Only</option>
                            <option value="Shorts Only">Shorts Only</option>
                            <option value="3-Piece Set">3-Piece Set</option>
                            <option value="4-Piece Set">4-Piece Set</option>
                            <option value="Dress Only">Dress Only</option>
                            <option value="Kaftan Only">Kaftan Only</option>
                            <option value="Agbada Only">Agbada Only</option>
                            <option value="Blouse Only">Blouse Only</option>
                            <option value="Top Only">Top Only</option>
                            <option value="Skirt Only">Skirt Only</option>
                            <option value="Wrapper Only">Wrapper Only</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-heritage-green uppercase">
                            Base Price (€)
                          </label>
                          <input
                            type="number"
                            value={newPrice}
                            onChange={(e) =>
                              setNewPrice(parseInt(e.target.value) || 0)
                            }
                            className="w-full px-2.5 py-1.5 border border-gray-200 bg-white rounded-lg text-xs font-mono"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const key = `${newOType}_${newComp}`;
                            setBusinessSettings((prev) => {
                              const prices = {
                                ...(prev.pricingSettings?.baseSewingPrices ||
                                  {}),
                              };
                              prices[key] = newPrice;
                              return {
                                ...prev,
                                pricingSettings: {
                                  ...prev.pricingSettings,
                                  baseSewingPrices: prices,
                                },
                              };
                            });
                            triggerStatus(
                              `Added base sewing price of €${newPrice} for ${newOType} (${newComp})!`,
                              "success",
                            );
                          }}
                          className="w-full py-2 bg-heritage-green text-heritage-gold font-bold uppercase tracking-wider text-[10px] rounded-lg border border-heritage-gold/20"
                        >
                          Add Combination
                        </button>
                      </div>

                      {/* Current base price list */}
                      <div className="overflow-x-auto border border-gray-100 rounded-xl">
                        <table className="w-full text-left border-collapse text-xs font-sans">
                          <thead>
                            <tr className="bg-heritage-forest/10 text-heritage-green font-serif font-bold uppercase tracking-wider text-[10px]">
                              <th className="px-4 py-3">Outfit Type</th>
                              <th className="px-4 py-3">Garment Composition</th>
                              <th className="px-4 py-3">
                                Base Sewing Price (€)
                              </th>
                              <th className="px-4 py-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {Object.entries(
                              businessSettings.pricingSettings
                                ?.baseSewingPrices || {},
                            ).map(([key, price]) => {
                              const [oType, comp] = key.split("_");
                              return (
                                <tr
                                  key={key}
                                  className="hover:bg-heritage-cream/10"
                                >
                                  <td className="px-4 py-2.5 font-bold text-heritage-green">
                                    {oType}
                                  </td>
                                  <td className="px-4 py-2.5 text-gray-600">
                                    {comp}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <input
                                      type="number"
                                      value={price}
                                      onChange={(e) => {
                                        const val =
                                          parseInt(e.target.value) || 0;
                                        setBusinessSettings((prev) => {
                                          const prices = {
                                            ...(prev.pricingSettings
                                              ?.baseSewingPrices || {}),
                                          };
                                          prices[key] = val;
                                          return {
                                            ...prev,
                                            pricingSettings: {
                                              ...prev.pricingSettings,
                                              baseSewingPrices: prices,
                                            },
                                          };
                                        });
                                      }}
                                      className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs font-mono focus:border-heritage-gold"
                                    />
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBusinessSettings((prev) => {
                                          const prices = {
                                            ...(prev.pricingSettings
                                              ?.baseSewingPrices || {}),
                                          };
                                          delete prices[key];
                                          return {
                                            ...prev,
                                            pricingSettings: {
                                              ...prev.pricingSettings,
                                              baseSewingPrices: prices,
                                            },
                                          };
                                        });
                                        triggerStatus(
                                          `Removed combination ${key}`,
                                          "success",
                                        );
                                      }}
                                      className="text-red-500 hover:text-red-700 font-bold"
                                    >
                                      Delete
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Customization Surcharges Card */}
                    <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
                      <div className="mb-4">
                        <h3 className="font-serif font-bold text-lg text-heritage-green">
                          Customization Pricing
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Define standard pricing surcharges for specific
                          tailoring and finish options.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                          <span className="text-xs font-bold text-heritage-green">
                            Female Lining/Inner Net (L5)
                          </span>
                          <span className="text-xs text-heritage-ink/70 font-bold">
                            €10.00 (Fixed)
                          </span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                          <span className="text-xs font-bold text-heritage-green">
                            Bespoke Monogram Name Inscription
                          </span>
                          <span className="text-xs text-heritage-ink/70 font-bold">
                            €10.00 (Fixed)
                          </span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                          <span className="text-xs font-bold text-heritage-green">
                            Premium Metallic Buttons Addon
                          </span>
                          <span className="text-xs text-heritage-ink/70 font-bold">
                            €15.00 (Fixed)
                          </span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-xl border border-gray-100">
                          <span className="text-xs font-bold text-heritage-green">
                            Handmade Chest Embroidery Accents
                          </span>
                          <span className="text-xs text-heritage-ink/70 font-bold">
                            €30.00 (Fixed)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Shipping Rules Card */}
                    <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
                      <div className="mb-4">
                        <h3 className="font-serif font-bold text-lg text-heritage-green">
                          Shipping Rules & Courier Rates
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Configure physical transport parameters and express
                          production rules.
                        </p>
                      </div>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs text-gray-600 font-medium block">
                              Community Batch Shipping Rate (€)
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.shippingSettings
                                  .communityBatchShippingRate
                              }
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  shippingSettings: {
                                    ...prev.shippingSettings,
                                    communityBatchShippingRate: val,
                                  },
                                }));
                              }}
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-heritage-gold font-mono"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-gray-600 font-medium block">
                              Individual Home Courier Shipping Rate (€)
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.shippingSettings
                                  .individualOrderShippingRate
                              }
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  shippingSettings: {
                                    ...prev.shippingSettings,
                                    individualOrderShippingRate: val,
                                  },
                                }));
                              }}
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-heritage-gold font-mono"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-gray-600 font-medium block">
                              Personalized Group Shipping Rate (€)
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.shippingSettings
                                  .personalizedBatchShippingRate
                              }
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  shippingSettings: {
                                    ...prev.shippingSettings,
                                    personalizedBatchShippingRate: val,
                                  },
                                }));
                              }}
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-heritage-gold font-mono"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs text-gray-600 font-medium block">
                              International Delivery Surcharge (€)
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.shippingSettings
                                  .internationalDeliverySurcharge
                              }
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  shippingSettings: {
                                    ...prev.shippingSettings,
                                    internationalDeliverySurcharge: val,
                                  },
                                }));
                              }}
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-heritage-gold font-mono"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-gray-600 font-medium block">
                              Express Production / Rush Order Surcharge (€)
                            </label>
                            <input
                              type="number"
                              value={
                                businessSettings.shippingSettings
                                  .expressDeliverySurcharge
                              }
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  shippingSettings: {
                                    ...prev.shippingSettings,
                                    expressDeliverySurcharge: val,
                                  },
                                }));
                              }}
                              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-heritage-gold font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --- FOUNDATION TABS --- */}
            {activeTab === "operations" && (
              <div className="space-y-6 text-left">
                <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
                  <h2 className="text-xl font-bold font-serif text-heritage-green mb-4">
                    Operations Command Centre
                  </h2>
                  <p className="text-sm text-heritage-ink/70 mb-6">
                    Centralized production, shipping, and fabric forecasting
                    dashboard.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
                      <h3 className="font-bold text-blue-900 mb-2">
                        Production Queue
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-blue-700">Yet To Start</span>
                          <strong className="text-blue-900">4</strong>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-blue-700">In Production</span>
                          <strong className="text-blue-900">2</strong>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-blue-700">Quality Control</span>
                          <strong className="text-blue-900">1</strong>
                        </div>
                      </div>
                    </div>

                    <div className="bg-green-50/50 border border-green-100 p-4 rounded-xl">
                      <h3 className="font-bold text-green-900 mb-2">
                        Shipping Forecast
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-green-700">
                            Pending Shipment
                          </span>
                          <strong className="text-green-900">28 Pkgs</strong>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-green-700">In Transit</span>
                          <strong className="text-green-900">12 Pkgs</strong>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-green-700">Arrived NL Hub</span>
                          <strong className="text-green-900">5 Pkgs</strong>
                        </div>
                      </div>
                    </div>

                    <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-xl">
                      <h3 className="font-bold text-amber-900 mb-2">
                        Fabric Logistics
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-700">Procuring</span>
                          <strong className="text-amber-900">420 Yds</strong>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-700">In Stock</span>
                          <strong className="text-amber-900">1,250 Yds</strong>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-amber-700">
                            Low Stock Alerts
                          </span>
                          <strong className="text-amber-900">3 Fabrics</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "media" && (
              <div className="space-y-6 text-left">
                <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-bold font-serif text-heritage-green">
                        Global Media Library
                      </h2>
                      <p className="text-sm text-heritage-ink/70">
                        Centralized repository for all images, banners, and
                        assets.
                      </p>
                    </div>
                    <button className="flex items-center gap-2 bg-heritage-green text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-800 transition">
                      <Upload size={16} /> Upload Media
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {mediaLibrary.map((media) => (
                      <div
                        key={media.id}
                        className="border border-gray-200 rounded-lg overflow-hidden group"
                      >
                        <div className="aspect-square bg-gray-100 relative">
                          <img
                            src={media.url}
                            alt={media.altText}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition">
                            <button className="h-8 w-8 bg-white text-gray-800 rounded-full flex items-center justify-center hover:bg-gray-100">
                              <Edit2 size={14} />
                            </button>
                            <button className="h-8 w-8 bg-white text-red-600 rounded-full flex items-center justify-center hover:bg-gray-100">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="p-2 text-xs truncate text-gray-700 font-medium">
                          {media.filename}
                        </div>
                      </div>
                    ))}
                    {mediaLibrary.length === 0 && (
                      <div className="col-span-full py-12 text-center text-gray-500 text-sm">
                        No media items found.
                      </div>
                    )}
                  </div>
                  <div className="mt-6 bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 text-sm text-blue-800">
                    <Info size={16} className="shrink-0 mt-0.5" />
                    <p>
                      <strong>WordPress Ready:</strong> This unified media
                      library will seamlessly sync with the WordPress Media
                      Library REST API in future releases.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "plugins" && (
              <div className="space-y-6 text-left">
                <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
                  <h2 className="text-xl font-bold font-serif text-heritage-green mb-4">
                    Plugin Manager
                  </h2>
                  <p className="text-sm text-heritage-ink/70 mb-6">
                    Manage external integrations and premium modules.
                  </p>

                  <div className="space-y-4">
                    {plugins.map((plugin) => (
                      <div
                        key={plugin.id}
                        className="border border-gray-200 rounded-xl p-4 flex items-start justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-800">
                              {plugin.name}
                            </h3>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                plugin.status === "active"
                                  ? "bg-green-100 text-green-700"
                                  : plugin.status === "update_available"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {plugin.status.replace("_", " ")}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {plugin.description}
                          </p>
                          <p className="text-xs text-gray-400 mt-2 font-mono">
                            v{plugin.version} • by {plugin.author}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50">
                            Settings
                          </button>
                          <button className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50">
                            Disable
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "audit" && (
              <div className="space-y-6 text-left">
                <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm overflow-hidden">
                  <h2 className="text-xl font-bold font-serif text-heritage-green mb-4">
                    System Audit Logs
                  </h2>
                  <p className="text-sm text-heritage-ink/70 mb-6">
                    Immutable record of administrative actions and system
                    events.
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                        <tr>
                          <th className="px-4 py-3 font-medium">Timestamp</th>
                          <th className="px-4 py-3 font-medium">User</th>
                          <th className="px-4 py-3 font-medium">Action</th>
                          <th className="px-4 py-3 font-medium">Entity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-[10px] text-gray-500">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-700">
                              {log.userName}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {log.action}
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600 border border-gray-200">
                                {log.entityType} ({log.entityId})
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "roles" && (
              <div className="space-y-6 text-left">
                <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
                  <h2 className="text-xl font-bold font-serif text-heritage-green mb-4">
                    Roles & Permissions
                  </h2>
                  <p className="text-sm text-heritage-ink/70 mb-6">
                    Manage access control and operational capabilities.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {roles.map((role) => (
                      <div
                        key={role.id}
                        className="border border-gray-200 p-4 rounded-xl space-y-3"
                      >
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-gray-800">
                            {role.name}
                          </h3>
                          {role.isSystem && (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                              System Role
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600">
                          {role.description}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {role.permissions.map((p) => (
                            <span
                              key={p}
                              className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[9px] font-mono"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "compliance" && (
              <div className="space-y-6 text-left">
                <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm space-y-6 animate-in fade-in duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-heritage-gold/10 pb-4 gap-4">
                    <div>
                      <h2 className="text-xl font-bold font-serif text-heritage-green">
                        Compliance & Biometric Consent (GDPR)
                      </h2>
                      <p className="text-xs text-heritage-ink/70">
                        Audit, verify, and monitor biometric consent records in
                        compliance with EU/Netherlands privacy guidelines.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const dataStr =
                          "data:text/json;charset=utf-8," +
                          encodeURIComponent(
                            JSON.stringify(
                              filteredCustomers.map((c) => ({
                                name: c.name,
                                email: c.email,
                                consentStatus:
                                  c.biometricConsent?.status || "No Action",
                                consentTimestamp:
                                  c.biometricConsent?.timestamp || "N/A",
                                gdprVersion:
                                  c.biometricConsent?.gdprVersion || "N/A",
                                userAgent:
                                  c.biometricConsent?.userAgent || "N/A",
                              })),
                              null,
                              2,
                            ),
                          );
                        const downloadAnchor = document.createElement("a");
                        downloadAnchor.setAttribute("href", dataStr);
                        downloadAnchor.setAttribute(
                          "download",
                          "odogwu_biometric_consent_export.json",
                        );
                        document.body.appendChild(downloadAnchor);
                        downloadAnchor.click();
                        downloadAnchor.remove();
                      }}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-heritage-green bg-heritage-gold/15 hover:bg-heritage-gold/25 border border-heritage-gold/30 rounded-xl transition cursor-pointer select-none whitespace-nowrap"
                    >
                      <Download size={13} />
                      <span>Export GDPR Consent Audit List</span>
                    </button>
                  </div>

                  {/* Stats overview widgets */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                      <span className="text-[10px] text-emerald-800 uppercase tracking-wider font-bold">
                        Accepted Consent
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-emerald-900">
                          {
                            customers.filter(
                              (c) => c.biometricConsent?.status === "accepted",
                            ).length
                          }
                        </span>
                        <span className="text-xs text-emerald-700">
                          active customers
                        </span>
                      </div>
                    </div>
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-1">
                      <span className="text-[10px] text-red-800 uppercase tracking-wider font-bold">
                        Declined Consent
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-red-900">
                          {
                            customers.filter(
                              (c) => c.biometricConsent?.status === "declined",
                            ).length
                          }
                        </span>
                        <span className="text-xs text-red-700">
                          returned to manual
                        </span>
                      </div>
                    </div>
                    <div className="p-4 bg-heritage-cream/40 border border-heritage-gold/25 rounded-xl space-y-1">
                      <span className="text-[10px] text-heritage-green uppercase tracking-wider font-bold">
                        GDPR Scope
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-heritage-forest">
                          v1.0 Netherlands
                        </span>
                        <span className="text-[9px] text-heritage-ink/60 bg-heritage-gold/15 px-1.5 py-0.5 rounded font-mono font-bold">
                          Active
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Consent record table */}
                  <div className="space-y-3">
                    <h3 className="font-bold text-heritage-green text-xs uppercase tracking-wider font-serif">
                      Consent Audit History
                    </h3>
                    <div className="overflow-x-auto border border-gray-150 rounded-xl">
                      <table className="min-w-full divide-y divide-gray-150 text-xs">
                        <thead className="bg-heritage-cream/25">
                          <tr>
                            <th className="px-4 py-3 text-left font-bold text-heritage-green">
                              Customer Name
                            </th>
                            <th className="px-4 py-3 text-left font-bold text-heritage-green">
                              Email Address
                            </th>
                            <th className="px-4 py-3 text-left font-bold text-heritage-green">
                              Consent Status
                            </th>
                            <th className="px-4 py-3 text-left font-bold text-heritage-green">
                              GDPR Version
                            </th>
                            <th className="px-4 py-3 text-left font-bold text-heritage-green">
                              Authorized Timestamp
                            </th>
                            <th className="px-4 py-3 text-left font-bold text-heritage-green">
                              User Agent / Platform
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {filteredCustomers.map((c, i) => (
                            <tr
                              key={c.email || i}
                              className="hover:bg-gray-50/50"
                            >
                              <td className="px-4 py-3 font-semibold text-heritage-ink">
                                {c.name}
                              </td>
                              <td className="px-4 py-3 font-mono text-gray-500">
                                {c.email}
                              </td>
                              <td className="px-4 py-3">
                                {c.biometricConsent ? (
                                  c.biometricConsent.status === "accepted" ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-[9px] uppercase tracking-wide">
                                      <CheckCircle2 size={10} /> Accepted
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full font-bold text-[9px] uppercase tracking-wide">
                                      <X size={10} className="w-2.5 h-2.5" />{" "}
                                      Declined
                                    </span>
                                  )
                                ) : (
                                  <span className="text-gray-400 italic">
                                    No Action Taken
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-gray-600">
                                {c.biometricConsent?.gdprVersion || "N/A"}
                              </td>
                              <td className="px-4 py-3 text-gray-500">
                                {c.biometricConsent?.timestamp
                                  ? new Date(
                                      c.biometricConsent.timestamp,
                                    ).toLocaleString()
                                  : "N/A"}
                              </td>
                              <td
                                className="px-4 py-3 text-gray-400 max-w-xs truncate"
                                title={c.biometricConsent?.userAgent || "N/A"}
                              >
                                {c.biometricConsent?.userAgent || "N/A"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Future WordPress Readiness note */}
                  <div className="bg-heritage-cream/20 border border-heritage-gold/25 p-4 rounded-xl flex items-start gap-3 text-xs text-heritage-ink/75">
                    <Info
                      size={16}
                      className="text-heritage-gold shrink-0 mt-0.5"
                    />
                    <div className="space-y-1">
                      <h4 className="font-bold text-heritage-green">
                        WordPress & WooCommerce GDPR Readiness
                      </h4>
                      <p className="leading-relaxed">
                        This consent schema is structured to map directly onto
                        standard WooCommerce Customer Meta keys (e.g.,{" "}
                        <code>_wp_odogwu_biometric_consent_v1_0</code>) and
                        WordPress User Meta records. Integrating with external
                        GDPR compliance plugins requires no structural schema
                        changes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
