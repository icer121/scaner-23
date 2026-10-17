import React, { useCallback, useState } from 'react';
import { signupWithPassword } from 'modelence/client';
import { Button } from '@/client/components/ui/Button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/client/components/ui/Card';
import { Input } from '@/client/components/ui/Input';
import { Label } from '@/client/components/ui/Label';
import { Link } from 'react-router';
import Page from '@/client/components/Page';
import VerifyEmailNotice from '@/client/components/VerifyEmailNotice';
import { toast } from 'react-hot-toast';

export default function SignupPage() {
  return (
    <Page seo={{ title: 'Sign up', noindex: true }}>
      <div className="flex items-center justify-center min-h-full">
        <SignupForm />
      </div>
    </Page>
  );
}

function SignupForm() {
  const [signupEmail, setSignupEmail] = useState<string | null>(null);

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    
    const email = String(formData.get('email'));
    const password = String(formData.get('password'));
    const confirmPassword = String(formData.get('confirmPassword'));
    
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    try {
      await signupWithPassword({ email, password });
      setSignupEmail(email);
    } catch (error) {
      console.error((error as Error).message);
    }
  }, []);

  if (signupEmail) {
    return (
      <VerifyEmailNotice
        email={signupEmail}
        title="Check your inbox"
        footer={
          <p className="text-center text-sm text-gray-600">
            Already verified?{' '}
            <Link
              to="/login"
              className="text-gray-900 underline hover:no-underline font-medium"
            >
              Sign in
            </Link>
          </p>
        }
      />
    );
  }

  return (
    <Card className="w-full max-w-sm mx-auto glass-card text-slate-200 animate-slide-up">
      <CardHeader className="text-center">
        <CardTitle className="text-xl font-display text-white">
          Create an account
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="email" className="block mb-2 text-slate-400">
              Email
            </Label>
            <Input 
              type="email" 
              name="email" 
              id="email" 
              required
              className="bg-slate-900/60 border-white/10 text-slate-100"
            />
          </div>
          
          <div>
            <Label htmlFor="password" className="block mb-2 text-slate-400">
              Password
            </Label>
            <Input 
              type="password" 
              name="password" 
              id="password" 
              required
              className="bg-slate-900/60 border-white/10 text-slate-100"
            />
          </div>

          <div>
            <Label htmlFor="confirm-password" className="block mb-2 text-slate-400">
              Confirm password
            </Label>
            <Input 
              type="password" 
              name="confirmPassword" 
              id="confirm-password" 
              required
              className="bg-slate-900/60 border-white/10 text-slate-100"
            />
          </div>

          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id="consent-terms"
                type="checkbox"
                name="consent-terms"
                className="w-4 h-4 border border-white/10 rounded bg-slate-900/60 focus:ring-3 focus:ring-indigo-500/40"
                required
              />
            </div>
            <div className="ml-3 text-sm">
              <Label htmlFor="consent-terms" className="text-slate-400">
                I accept the <a className="font-medium text-indigo-400 hover:text-indigo-300" href="/terms" target="_blank">Terms and Conditions</a>
              </Label>
            </div>
          </div>

          <Button
            className="w-full bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/30"
            type="submit"
          >
            Create account
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link
            to="/login"
            className="text-indigo-400 hover:text-indigo-300 font-medium"
          >
            Sign in here
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
