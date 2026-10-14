import { useEffect, useState } from 'react';
import { loadCloudVismaConceptCatalog } from './cloudMemory';
import { loadVismaConceptCatalogMemory, saveVismaConceptCatalogMemory } from './sessionPersistence';

export function useVismaHistoricalState(authUser) {
  const [vismaCatalogScope, setVismaCatalogScope] = useState('fruticola');
  const [vismaHistoricalCatalog, setVismaHistoricalCatalog] = useState(() => loadVismaConceptCatalogMemory('fruticola'));
  const [vismaHistoricalCatalogFileName, setVismaHistoricalCatalogFileName] = useState('');
  const [vismaHistoricalCatalogValidation, setVismaHistoricalCatalogValidation] = useState(null);
  const [isReadingVismaCatalog, setIsReadingVismaCatalog] = useState(false);
  const [isLoadingVismaCatalog, setIsLoadingVismaCatalog] = useState(false);
  const [vismaHistoricalTemplateResource, setVismaHistoricalTemplateResource] = useState(null);
  const [vismaHistoricalTemplateFileName, setVismaHistoricalTemplateFileName] = useState('');
  const [vismaHistoricalTemplateValidation, setVismaHistoricalTemplateValidation] = useState(null);
  const [isReadingVismaTemplate, setIsReadingVismaTemplate] = useState(false);
  const [vismaHistoricalEmployeeCatalog, setVismaHistoricalEmployeeCatalog] = useState(null);
  const [vismaEmployeeMasterFileName, setVismaEmployeeMasterFileName] = useState('');
  const [vismaEmployeeMasterValidation, setVismaEmployeeMasterValidation] = useState(null);
  const [isReadingVismaEmployeeMaster, setIsReadingVismaEmployeeMaster] = useState(false);
  const [vismaSourceEmployeeMaster, setVismaSourceEmployeeMaster] = useState(null);
  const [vismaSourceEmployeeMasterFileName, setVismaSourceEmployeeMasterFileName] = useState('');
  const [vismaSourceEmployeeMasterValidation, setVismaSourceEmployeeMasterValidation] = useState(null);
  const [isReadingVismaSourceEmployeeMaster, setIsReadingVismaSourceEmployeeMaster] = useState(false);

  useEffect(() => {
    let active = true;
    const localCatalog = loadVismaConceptCatalogMemory(vismaCatalogScope);
    setVismaHistoricalCatalog(localCatalog);
    setVismaHistoricalCatalogFileName('');
    setVismaHistoricalCatalogValidation(localCatalog?.length
      ? { isValid: true, message: `Catálogo local listo: ${localCatalog.length.toLocaleString('es-CL')} conceptos.` }
      : null);

    if (!authUser) {
      setIsLoadingVismaCatalog(false);
      return () => {
        active = false;
      };
    }

    setIsLoadingVismaCatalog(true);
    loadCloudVismaConceptCatalog(authUser, vismaCatalogScope)
      .then((cloudCatalog) => {
        if (!active) return;
        const nextCatalog = cloudCatalog?.length ? cloudCatalog : loadVismaConceptCatalogMemory(vismaCatalogScope);
        if (cloudCatalog?.length) saveVismaConceptCatalogMemory(vismaCatalogScope, cloudCatalog);
        setVismaHistoricalCatalog(nextCatalog);
        setVismaHistoricalCatalogValidation(nextCatalog?.length
          ? { isValid: true, message: `Catálogo listo: ${nextCatalog.length.toLocaleString('es-CL')} conceptos.` }
          : null);
      })
      .catch(() => {
        if (!active) return;
        const fallbackCatalog = loadVismaConceptCatalogMemory(vismaCatalogScope);
        setVismaHistoricalCatalog(fallbackCatalog);
        setVismaHistoricalCatalogValidation(fallbackCatalog?.length
          ? { isValid: true, message: `Catálogo local listo: ${fallbackCatalog.length.toLocaleString('es-CL')} conceptos.` }
          : null);
      })
      .finally(() => {
        if (active) setIsLoadingVismaCatalog(false);
      });

    return () => {
      active = false;
    };
  }, [authUser, vismaCatalogScope]);

  return {
    vismaCatalogScope,
    setVismaCatalogScope,
    vismaHistoricalCatalog,
    setVismaHistoricalCatalog,
    vismaHistoricalCatalogFileName,
    setVismaHistoricalCatalogFileName,
    vismaHistoricalCatalogValidation,
    setVismaHistoricalCatalogValidation,
    isReadingVismaCatalog,
    setIsReadingVismaCatalog,
    isLoadingVismaCatalog,
    setIsLoadingVismaCatalog,
    vismaHistoricalTemplateResource,
    setVismaHistoricalTemplateResource,
    vismaHistoricalTemplateFileName,
    setVismaHistoricalTemplateFileName,
    vismaHistoricalTemplateValidation,
    setVismaHistoricalTemplateValidation,
    isReadingVismaTemplate,
    setIsReadingVismaTemplate,
    vismaHistoricalEmployeeCatalog,
    setVismaHistoricalEmployeeCatalog,
    vismaEmployeeMasterFileName,
    setVismaEmployeeMasterFileName,
    vismaEmployeeMasterValidation,
    setVismaEmployeeMasterValidation,
    isReadingVismaEmployeeMaster,
    setIsReadingVismaEmployeeMaster,
    vismaSourceEmployeeMaster,
    setVismaSourceEmployeeMaster,
    vismaSourceEmployeeMasterFileName,
    setVismaSourceEmployeeMasterFileName,
    vismaSourceEmployeeMasterValidation,
    setVismaSourceEmployeeMasterValidation,
    isReadingVismaSourceEmployeeMaster,
    setIsReadingVismaSourceEmployeeMaster,
  };
}
