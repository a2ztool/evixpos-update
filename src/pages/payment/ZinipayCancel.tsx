import { useEffect } from "react";
import { Link } from "react-router-dom";
import { XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { clearPendingValId } from "@/lib/zinipayCheckout";

const ZinipayCancel = () => {
  useEffect(() => {
    clearPendingValId();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center space-y-4">
          <XCircle className="h-14 w-14 mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-semibold">Payment cancelled</h1>
          <p className="text-sm text-muted-foreground">
            You cancelled the payment. No money has been deducted from your account.
          </p>
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link to="/my-plan">Try Again</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ZinipayCancel;