import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

content = content.replace("""  const [days, setDays] = useState(17);
  const [hours, setHours] = useState(8);
  const [minutes, setMinutes] = useState(14);""", """  const [now, setNow] = useState(new Date());""")

content = content.replace("""  // Simple countdown simulation
  useEffect(() => {
    const timer = setInterval(() => {
      setMinutes((prev) => {
        if (prev > 0) return prev - 1;
        setHours((h) => {
          if (h > 0) return h - 1;
          setDays((d) => (d > 0 ? d - 1 : 0));
          return 23;
        });
        return 59;
      });
    }, 60000);
    return () => clearInterval(timer);
  }, []);""", """  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000); // update every minute
    return () => clearInterval(timer);
  }, []);
  
  let days = 0;
  let hours = 0;
  let minutes = 0;
  
  if (activeCommunityBatch?.closingDate) {
    const endDate = new Date(activeCommunityBatch.closingDate);
    // ensure end date represents the end of the day if no time is specified
    if (activeCommunityBatch.closingDate.length <= 10) {
      endDate.setHours(23, 59, 59, 999);
    }
    const diffMs = endDate.getTime() - now.getTime();
    if (diffMs > 0) {
      days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    }
  }""")

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(content)
