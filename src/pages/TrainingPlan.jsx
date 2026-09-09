import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMutation } from '@tanstack/react-query';
import { generateTrainingPlan } from '@/functions/generateTrainingPlan';
import { Loader2, Zap } from 'lucide-react';

// Main component for generating and displaying the training plan
export default function TrainingPlanPage() {
    const [plan, setPlan] = useState(null);
    const [formError, setFormError] = useState(null);

    const mutation = useMutation({
        mutationFn: (planData) => generateTrainingPlan(planData),
        onSuccess: (response) => {
            const data = response?.data || response;
            setPlan(data);
            setFormError(null);
        },
        onError: (error) => {
            const errorData = error.response?.data || { error: error.message };
            setFormError(errorData.error + (errorData.recommendation ? ` ${errorData.recommendation}`: ''));
            setPlan(null);
        }
    });

    const handleSubmit = (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const data = Object.fromEntries(formData.entries());
        data.plan_length_weeks = parseInt(data.plan_length_weeks, 10);
        data.training_days_per_week = parseInt(data.training_days_per_week, 10);
        mutation.mutate(data);
    };
    
    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <Zap className="w-8 h-8 text-orange-500" />
                        Training Plan Generator
                    </h1>
                    <p className="text-gray-600 mt-1">
                        Generate a personalized running plan with Elite Coach.
                    </p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1">
                        <Card>
                            <CardHeader>
                                <CardTitle>Create Your Plan</CardTitle>
                                <CardDescription>Tell us about your goal and we'll generate a plan.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <Label htmlFor="target_distance">Target Distance</Label>
                                        <Select name="target_distance" required>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a distance" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="5k">5K</SelectItem>
                                                <SelectItem value="10k">10K</SelectItem>
                                                <SelectItem value="15k">15K</SelectItem>
                                                <SelectItem value="half_marathon">Half Marathon</SelectItem>
                                                <SelectItem value="marathon">Marathon</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="plan_length_weeks">Plan Length (weeks)</Label>
                                        <Input name="plan_length_weeks" type="number" min="8" max="16" required placeholder="e.g., 12" />
                                    </div>
                                    <div>
                                        <Label htmlFor="training_days_per_week">Training Days per Week</Label>
                                        <Select name="training_days_per_week" defaultValue="4">
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="3">3 days</SelectItem>
                                                <SelectItem value="4">4 days</SelectItem>
                                                <SelectItem value="5">5 days</SelectItem>
                                                <SelectItem value="6">6 days</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="finish_time_goal">Finish Time Goal (optional)</Label>
                                        <Input name="finish_time_goal" type="text" placeholder="e.g., 03:59:00" />
                                    </div>
                                    
                                    {formError && <p className="text-sm text-red-600">{formError}</p>}
                                    
                                    <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600" disabled={mutation.isPending}>
                                        {mutation.isPending ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : null}
                                        Generate Plan
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-2">
                        {plan ? (
                            <GeneratedPlan plan={plan} />
                        ) : (
                            <Card className="flex items-center justify-center h-full border-dashed">
                                <div className="text-center text-gray-500">
                                    <p>Your generated training plan will appear here.</p>
                                </div>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// A component to display the generated plan
function GeneratedPlan({ plan }) {
    const [activeWeek, setActiveWeek] = useState(0);

    if (!plan) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>{`Your ${plan.plan_length_weeks}-Week ${plan.target_distance} Plan`}</CardTitle>
                <CardDescription>{plan.plan_overview?.summary}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    <div>
                        <h3 className="font-semibold mb-2">Pace Guide</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-sm">
                            {Object.entries(plan.pace_guide || {}).map(([key, value]) => (
                                <div key={key} className="bg-gray-100 p-2 rounded-lg">
                                    <p className="font-medium capitalize">{key}</p>
                                    <p className="text-gray-600">{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="font-semibold mb-2">Weekly Plan</h3>
                        <div className="flex border-b mb-4">
                            {plan.weekly_plan?.map((week, index) => (
                                <button 
                                    key={week.week}
                                    onClick={() => setActiveWeek(index)}
                                    className={`px-4 py-2 text-sm ${activeWeek === index ? 'border-b-2 border-orange-500 text-orange-600 font-semibold' : 'text-gray-500'}`}
                                >
                                    Week {week.week}
                                </button>
                            ))}
                        </div>
                        <div>
                            {plan.weekly_plan?.[activeWeek]?.sessions.map(session => (
                                <div key={session.day} className="border-b py-2 grid grid-cols-3 gap-4">
                                    <p className="font-semibold">{session.day}</p>
                                    <div className="col-span-2">
                                        <p className="font-medium">{session.session_type}</p>
                                        <p className="text-sm text-gray-600">{session.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}