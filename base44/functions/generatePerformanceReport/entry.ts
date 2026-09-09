import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.1';
import autoTable from 'npm:jspdf-autotable@3.8.2';
import { format } from 'npm:date-fns@3.6.0';

const formatDuration = (seconds) => {
    if (!seconds || seconds < 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.round(seconds % 60);
    return [
        h > 0 ? `${h}h` : '',
        m > 0 ? `${m}m` : '',
        s > 0 ? `${s}s` : ''
    ].filter(Boolean).join(' ') || '0s';
};

const addWrappedText = (doc, text, x, y, maxWidth) => {
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return lines.length * (doc.getLineHeight() / doc.internal.scaleFactor);
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) throw new Error('Unauthorized');

        const { startDate, endDate } = await req.json();
        if (!startDate || !endDate) throw new Error('Missing date range');

        // 1. Fetch data
        const activities = await base44.entities.Activity.filter({
            created_by: user.email,
            start_date: { $gte: startDate, $lte: endDate }
        }, '-start_date', 500);

        const bestEfforts = await base44.entities.BestEffort.filter({
            created_by: user.email,
            activity_date: { $gte: startDate, $lte: endDate }
        });

        // 2. Get AI Insights
        let coachingNotes = 'No insights generated.';
        if (activities.length > 0) {
            const activitySummary = activities.slice(0, 10).map(a => 
                `- ${a.name} (${a.type}): ${a.distance_m/1000}km in ${formatDuration(a.moving_time_s)}`
            ).join('\\n');

            const prompt = `
                As an elite endurance coach, analyze the following training period for an athlete.
                Period: ${startDate} to ${endDate}.
                Total Activities: ${activities.length}.
                Recent activities sample:\\n${activitySummary}
                
                Provide a concise summary (3-4 sentences) covering:
                1. Overall training load consistency.
                2. One key strength or positive trend.
                3. One primary area for improvement.
                
                Keep the tone encouraging and actionable. Do not add greetings or sign-offs.
            `;
            
            try {
                const llmResponse = await base44.integrations.Core.InvokeLLM({ prompt });
                coachingNotes = llmResponse.data || llmResponse;
            } catch (llmError) {
                console.error("LLM invocation failed:", llmError);
                coachingNotes = "Could not generate coaching insights at this time.";
            }
        } else {
            coachingNotes = "Not enough activity data in this period to generate insights. Keep training!";
        }


        // 3. Generate PDF
        const doc = new jsPDF();
        const pageHeight = doc.internal.pageSize.height;
        let lastY = 22;

        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor('#E65100');
        doc.text('Performance Report', 14, lastY);
        lastY += 8;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Athlete: ${user.full_name || user.email}`, 14, lastY);
        lastY += 6;
        doc.text(`Period: ${format(new Date(startDate), 'MMM d, yyyy')} to ${format(new Date(endDate), 'MMM d, yyyy')}`, 14, lastY);
        lastY += 15;

        // Summary Stats
        const totalDistance = activities.reduce((sum, a) => sum + (a.distance_m || 0), 0);
        const totalTime = activities.reduce((sum, a) => sum + (a.moving_time_s || 0), 0);
        const totalElevation = activities.reduce((sum, a) => sum + (a.total_elevation_gain_m || 0), 0);
        
        autoTable(doc, {
            startY: lastY,
            head: [['Metric', 'Total']],
            body: [
                ['Total Activities', activities.length],
                ['Total Distance', `${(totalDistance / 1000).toFixed(2)} km`],
                ['Total Moving Time', formatDuration(totalTime)],
                ['Total Elevation Gain', `${Math.round(totalElevation)} m`],
            ],
            theme: 'striped',
            headStyles: { fillColor: '#F6821F' }
        });
        lastY = doc.lastAutoTable.finalY + 15;

        // AI Coach's Notes
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor('#E65100');
        doc.text("Coach's Notes", 14, lastY);
        lastY += 8;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(50);
        lastY += addWrappedText(doc, coachingNotes, 16, lastY, 180);
        lastY += 10;
        
        // Key Achievements
        if (bestEfforts.length > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor('#E65100');
            doc.text('Key Achievements (New PRs)', 14, lastY);
            lastY += 8;

            const effortBody = bestEfforts.map(be => [be.distance_name, formatDuration(be.elapsed_time_s), be.activity_name, format(new Date(be.activity_date), 'MMM d, yyyy')]);
            autoTable(doc, {
                startY: lastY,
                head: [['Distance', 'Time', 'Activity', 'Date']],
                body: effortBody,
                theme: 'grid',
                headStyles: { fillColor: '#F6821F' }
            });
            lastY = doc.lastAutoTable.finalY + 15;
        }

        // Activity Log
        if (activities.length > 0) {
            if (lastY > pageHeight - 60) {
                doc.addPage();
                lastY = 22;
            }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor('#E65100');
            doc.text('Activity Log', 14, lastY);
            lastY += 8;

            const activityBody = activities.slice(0, 30).map(a => [
                format(new Date(a.start_date), 'MMM d, yy'),
                a.name,
                a.type,
                `${(a.distance_m / 1000).toFixed(2)} km`,
                a.average_heartrate ? Math.round(a.average_heartrate) : 'N/A'
            ]);
            autoTable(doc, {
                startY: lastY,
                head: [['Date', 'Name', 'Type', 'Distance', 'Avg HR']],
                body: activityBody,
                theme: 'striped',
                headStyles: { fillColor: '#F6821F' }
            });
        }
        
        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 25, doc.internal.pageSize.height - 10);
            doc.text(`Report generated on ${format(new Date(), 'yyyy-MM-dd')}`, 14, doc.internal.pageSize.height - 10);
        }

        const pdfBytes = doc.output('arraybuffer');
        return new Response(pdfBytes, {
            status: 200,
            headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="performance_report.pdf"' }
        });

    } catch (error) {
        console.error('Error generating performance report:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});