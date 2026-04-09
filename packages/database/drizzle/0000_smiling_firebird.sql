CREATE TABLE "globalmodelhistory" (
	"serialno" serial PRIMARY KEY NOT NULL,
	"coeff" jsonb NOT NULL,
	"intercept" jsonb NOT NULL,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "usermodelhistory" (
	"serialno" serial PRIMARY KEY NOT NULL,
	"userid" integer,
	"coeff" jsonb NOT NULL,
	"intercept" jsonb NOT NULL,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"userid" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "usermodelhistory" ADD CONSTRAINT "usermodelhistory_userid_users_userid_fk" FOREIGN KEY ("userid") REFERENCES "public"."users"("userid") ON DELETE no action ON UPDATE no action;