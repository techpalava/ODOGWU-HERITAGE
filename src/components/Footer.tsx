import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { Phone, Mail, MapPin, Clock, Facebook, Instagram, MessageCircle, Music2, Linkedin, Youtube, ChevronRight } from 'lucide-react';
import odogwuLogo from '../assets/images/odogwu_logo_1782556303014.jpg';

export default function Footer() {
  const { activeTab, setActiveTab, businessSettings } = useAppStore();

  const handleNavigation = (e: React.MouseEvent, tab: string) => {
    e.preventDefault();
    setActiveTab(tab as any);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const quickLinks = [
    { label: 'Home', tab: 'home' },
    { label: 'Design Studio', tab: 'design' },
    { label: 'Gallery', tab: 'gallery' },
    { label: 'How It Works', tab: 'home' }, // Assuming it scrolls or goes to home
    { label: 'Join Current Batch', tab: 'home' }, // Depending on implementation
    { label: 'Contact', tab: 'home' }, // Depending on implementation
  ];

  return (
    <footer className="border-t border-heritage-gold/20 bg-heritage-green text-heritage-beige/80 pt-16 pb-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 font-sans">
        
        {/* Main Footer Content - 4 Columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8 mb-16">
          
          {/* Column 1 - Brand */}
          <div className="flex flex-col space-y-4 items-center sm:items-start text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <img 
                loading="lazy"
                src={odogwuLogo}
                alt={businessSettings?.applicationSettings?.communityName || 'The Odogwu Heritage'}
                className="w-14 h-14 rounded-full border border-heritage-gold/30 object-cover bg-heritage-forest shadow-sm shrink-0"
                referrerPolicy="no-referrer"
              />
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-widest text-heritage-gold uppercase font-display">
                  {businessSettings?.applicationSettings?.communityName || 'The Odogwu Heritage'}
                </span>
              </div>
            </div>
            <p className="text-sm font-medium text-heritage-beige/90 leading-relaxed font-serif italic">
              {businessSettings?.applicationSettings?.tagline || 'Nigerian Traditional Clothing Community at ASML'}
            </p>
            <p className="text-xs text-heritage-beige/60 leading-relaxed">
              {businessSettings?.applicationSettings?.description || 'The Nigerian Traditional Clothing Community at ASML, connecting skilled artisans in Nigeria with communities across the Netherlands through premium custom-made traditional clothing.'}
            </p>
          </div>

          {/* Column 2 - Quick Links */}
          <div className="flex flex-col space-y-4 items-center sm:items-start text-center sm:text-left">
            <h3 className="text-xs uppercase font-bold tracking-widest text-heritage-gold border-b border-heritage-gold/20 pb-2 inline-block w-fit">
              Quick Links
            </h3>
            <ul className="space-y-2.5 flex flex-col items-center sm:items-start">
              {quickLinks.map((link, index) => (
                <li key={index}>
                  <button 
                    onClick={(e) => handleNavigation(e, link.tab)}
                    className={`text-xs flex items-center gap-1.5 transition-colors duration-200 hover:text-heritage-gold ${
                      activeTab === link.tab ? 'text-heritage-gold font-bold' : 'text-heritage-beige/70'
                    }`}
                  >
                    <ChevronRight size={12} className="opacity-50" />
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 - Contact Information */}
          <div className="flex flex-col space-y-4 items-center sm:items-start text-center sm:text-left">
            <h3 className="text-xs uppercase font-bold tracking-widest text-heritage-gold border-b border-heritage-gold/20 pb-2 inline-block w-fit">
              Contact Information
            </h3>
            <ul className="space-y-3.5 text-xs text-heritage-beige/70 flex flex-col items-center sm:items-start">
              <li className="flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-3">
                <Phone size={14} className="text-heritage-gold mt-0.5 shrink-0" />
                <a href={`tel:${businessSettings?.applicationSettings?.primaryPhone?.replace(/\s/g, '') || '+31644533190'}`} className="hover:text-heritage-gold transition">
                  {businessSettings?.applicationSettings?.primaryPhone || '+31 644 533 190'}
                </a>
              </li>
              <li className="flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-3">
                <MessageCircle size={14} className="text-heritage-gold mt-0.5 shrink-0" />
                <a href={`https://wa.me/${businessSettings?.applicationSettings?.whatsappNumber?.replace(/\D/g, '') || '31657903098'}`} className="hover:text-heritage-gold transition">
                  {businessSettings?.applicationSettings?.whatsappNumber || '+31 657 903 098'} (WhatsApp)
                </a>
              </li>
              <li className="flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-3">
                <Mail size={14} className="text-heritage-gold mt-0.5 shrink-0" />
                <div className="flex flex-col space-y-1 items-center sm:items-start">
                  <a href={`mailto:${businessSettings?.applicationSettings?.primaryEmail || 'f.o.startups@gmail.com'}`} className="hover:text-heritage-gold transition">
                    {businessSettings?.applicationSettings?.primaryEmail || 'f.o.startups@gmail.com'}
                  </a>
                  <a href={`mailto:${businessSettings?.applicationSettings?.secondaryEmail || 'vaprecfamily@gmail.com'}`} className="hover:text-heritage-gold transition">
                    {businessSettings?.applicationSettings?.secondaryEmail || 'vaprecfamily@gmail.com'}
                  </a>
                </div>
              </li>
              <li className="flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-3">
                <MapPin size={14} className="text-heritage-gold mt-0.5 shrink-0" />
                <span className="leading-relaxed text-center sm:text-left">
                  {businessSettings?.productionSettings?.defaultPickupLocation || 'ASML Veldhoven Campus, Netherlands'}
                </span>
              </li>
              <li className="flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-3">
                <Clock size={14} className="text-heritage-gold mt-0.5 shrink-0" />
                <span className="leading-relaxed text-center sm:text-left">
                  {businessSettings?.applicationSettings?.businessHours || 'Mon - Fri: 9:00 AM - 6:00 PM'}
                </span>
              </li>
            </ul>
          </div>

          {/* Column 4 - Connect */}
          <div className="flex flex-col space-y-4 items-center sm:items-start text-center sm:text-left">
            <h3 className="text-xs uppercase font-bold tracking-widest text-heritage-gold border-b border-heritage-gold/20 pb-2 inline-block w-fit">
              Connect With Us
            </h3>
            <p className="text-xs text-heritage-beige/60 mb-2 leading-relaxed">
              Join our growing community and stay updated on the latest batches and designs.
            </p>
            <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
              <a href={businessSettings?.applicationSettings?.socialLinks?.whatsapp || '#'} aria-label="WhatsApp" className="flex items-center justify-center w-10 h-10 rounded-full bg-heritage-forest border border-heritage-gold/20 hover:border-heritage-gold hover:bg-heritage-gold/10 hover:-translate-y-1 transition-all duration-300 text-heritage-beige/80 hover:text-heritage-gold">
                <MessageCircle size={18} />
              </a>
              <a href={businessSettings?.applicationSettings?.socialLinks?.facebook || '#'} aria-label="Facebook" className="flex items-center justify-center w-10 h-10 rounded-full bg-heritage-forest border border-heritage-gold/20 hover:border-heritage-gold hover:bg-heritage-gold/10 hover:-translate-y-1 transition-all duration-300 text-heritage-beige/80 hover:text-heritage-gold">
                <Facebook size={18} />
              </a>
              <a href={businessSettings?.applicationSettings?.socialLinks?.instagram || '#'} aria-label="Instagram" className="flex items-center justify-center w-10 h-10 rounded-full bg-heritage-forest border border-heritage-gold/20 hover:border-heritage-gold hover:bg-heritage-gold/10 hover:-translate-y-1 transition-all duration-300 text-heritage-beige/80 hover:text-heritage-gold">
                <Instagram size={18} />
              </a>
              <a href={businessSettings?.applicationSettings?.socialLinks?.tiktok || '#'} aria-label="TikTok" className="flex items-center justify-center w-10 h-10 rounded-full bg-heritage-forest border border-heritage-gold/20 hover:border-heritage-gold hover:bg-heritage-gold/10 hover:-translate-y-1 transition-all duration-300 text-heritage-beige/80 hover:text-heritage-gold">
                <Music2 size={18} />
              </a>
              <a href={businessSettings?.applicationSettings?.socialLinks?.linkedin || '#'} aria-label="LinkedIn" className="flex items-center justify-center w-10 h-10 rounded-full bg-heritage-forest border border-heritage-gold/20 hover:border-heritage-gold hover:bg-heritage-gold/10 hover:-translate-y-1 transition-all duration-300 text-heritage-beige/80 hover:text-heritage-gold">
                <Linkedin size={18} />
              </a>
              <a href={businessSettings?.applicationSettings?.socialLinks?.youtube || '#'} aria-label="YouTube" className="flex items-center justify-center w-10 h-10 rounded-full bg-heritage-forest border border-heritage-gold/20 hover:border-heritage-gold hover:bg-heritage-gold/10 hover:-translate-y-1 transition-all duration-300 text-heritage-beige/80 hover:text-heritage-gold">
                <Youtube size={18} />
              </a>
            </div>
          </div>

        </div>
        
        {/* Footer Bottom Bar */}
        <div className="pt-8 border-t border-heritage-gold/20 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] sm:text-xs text-heritage-beige/50">
          <div className="order-3 md:order-1 text-center md:text-left">
            © {new Date().getFullYear()} {businessSettings?.applicationSettings?.communityName || 'The Odogwu Heritage'}
          </div>
          <div className="order-1 md:order-2 text-center text-heritage-gold/80 font-serif italic tracking-wide">
            Authentically Crafted in Nigeria • Delivered Across the Netherlands
          </div>
          <div className="order-2 md:order-3 flex gap-4 justify-center md:justify-end w-full md:w-auto text-center md:text-right">
            <a href="#" className="hover:text-heritage-gold transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-heritage-gold transition-colors">Terms & Conditions</a>
            <a href="#" className="hover:text-heritage-gold transition-colors">Cookie Policy</a>
          </div>
        </div>
        
      </div>
    </footer>
  );
}
