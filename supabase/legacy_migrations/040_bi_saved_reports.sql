-- Criação da tabela bi_saved_reports para relatórios salvos do Flowfy BI
CREATE TABLE IF NOT EXISTS public.bi_saved_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    chart_type TEXT NOT NULL,
    query_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_public BOOLEAN NOT NULL DEFAULT false, -- Gestores podem definir se o relatório é visível para analistas
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ativar RLS
ALTER TABLE public.bi_saved_reports ENABLE ROW LEVEL SECURITY;

-- Policy 1: Sysadmin pode ver tudo
CREATE POLICY "Sysadmin can manage all bi_reports" ON public.bi_saved_reports
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'sysadmin'
    )
);

-- Policy 2: Usuários comuns podem ver relatórios da sua companhia (gestores gerenciam, analistas visualizam publicos ou criados por eles)
CREATE POLICY "Users can view company bi_reports" ON public.bi_saved_reports
FOR SELECT USING (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    AND (
        -- Analistas só veem se o relatório for público, ou se eles próprios criaram
        (
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                AND role = 'agent'
            )
            AND (is_public = true OR created_by = auth.uid())
        )
        OR
        -- Outros gestores/admins veem tudo da empresa
        (
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                AND role != 'agent'
            )
        )
    )
);

-- Policy 3: Inserção permitida para gestores, admins ou para o analista inserindo para si
CREATE POLICY "Users can insert company bi_reports" ON public.bi_saved_reports
FOR INSERT WITH CHECK (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    AND created_by = auth.uid()
);

-- Policy 4: Atualização permitida para o criador ou gestor da empresa
CREATE POLICY "Users can update company bi_reports" ON public.bi_saved_reports
FOR UPDATE USING (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    AND (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('sysadmin', 'company_admin')
        )
    )
);

-- Policy 5: Deleção permitida para o criador ou gestor da empresa
CREATE POLICY "Users can delete company bi_reports" ON public.bi_saved_reports
FOR DELETE USING (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    AND (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('sysadmin', 'company_admin')
        )
    )
);
