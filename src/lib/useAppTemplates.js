import { useEffect } from 'react';
import {
  loadBukColaboradoresTemplateResource,
  loadBukTrabajosTemplateResource,
  loadRexTemplateResource,
} from './template';
import { loadConceptsResource } from './concepts';

export function useAppTemplates({
  setColaboradoresTemplateResource,
  setConceptsResource,
  setGlobalError,
  setBaseRexTemplateResource,
  setTemplateStatus,
  setTrabajosTemplateResource,
}) {
  useEffect(() => {
    let isMounted = true;

    async function bootstrapTemplates() {
      try {
        const [colaboradoresTemplate, trabajosTemplate, rexTemplate, concepts] = await Promise.all([
          loadBukColaboradoresTemplateResource(),
          loadBukTrabajosTemplateResource(),
          loadRexTemplateResource(),
          loadConceptsResource(),
        ]);

        if (!isMounted) return;

        setColaboradoresTemplateResource(colaboradoresTemplate);
        setTrabajosTemplateResource(trabajosTemplate);
        setBaseRexTemplateResource(rexTemplate);
        setConceptsResource(concepts);
        setTemplateStatus('ready');
      } catch (error) {
        if (!isMounted) return;

        setTemplateStatus('error');
        setGlobalError(error.message);
      }
    }

    bootstrapTemplates();
    return () => { isMounted = false; };
  }, [
    setBaseRexTemplateResource,
    setColaboradoresTemplateResource,
    setConceptsResource,
    setGlobalError,
    setTemplateStatus,
    setTrabajosTemplateResource,
  ]);
}
