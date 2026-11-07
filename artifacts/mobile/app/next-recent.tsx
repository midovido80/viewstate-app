import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import type { Property, SeekerRequirement } from "@workspace/property-domain";
import type { Person } from "@/services/people";
import { useUserData } from "@/contexts/UserDataContext";
import { useI18n } from "@/contexts/I18nContext";
import { NextPage } from "@/components/next/NextSurfaces";
import { NextRecentWork } from "@/components/next/NextRecentWork";
import { Button } from "@/components/Button";
export default function RecentPage() {
  const { store } = useUserData(),
    { language } = useI18n(),
    [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<{
      properties: Property[];
      requirements: SeekerRequirement[];
      people: Person[];
    } | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    setData(null);
    void Promise.all([
      store.getProperties(),
      store.getRequirements(),
      store.getPeople(),
    ])
      .then(([properties, requirements, people]) => {
        if (active) setData({ properties, requirements, people });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [store, attempt]);
  return (
    <NextPage
      title={language === "ar" ? "آخر ما عملت عليه" : "Recently worked on"}
    >
      {data ? (
        <NextRecentWork {...data} full limit={12} />
      ) : error ? (
        <>
          <Text>
            {language === "ar"
              ? "تعذر تحميل السجلات."
              : "Records could not load."}
          </Text>
          <Button
            title={language === "ar" ? "إعادة المحاولة" : "Retry"}
            onPress={() => setAttempt((v) => v + 1)}
          />
        </>
      ) : (
        <ActivityIndicator />
      )}
    </NextPage>
  );
}
